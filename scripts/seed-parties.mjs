#!/usr/bin/env node
/**
 * 업체 7곳 / 파티 50개를 Admin v2 API로 등록한다.
 *
 *   node scripts/seed-parties.mjs --env staging                      # 계획만 출력
 *   node scripts/seed-parties.mjs --env staging --apply
 *   node scripts/seed-parties.mjs --env production --apply --ack I_ACKNOWLEDGE_PRODUCTION_SEED
 *
 * 계정은 환경변수로만 받는다(DOPA_SEED_EMAIL / DOPA_SEED_PASSWORD). 인자로
 * 받으면 셸 히스토리와 `ps`에 비밀번호가 남는다.
 *
 * 기본이 dry-run인 이유: 이 스크립트의 실수는 되돌리기가 비싸다. 파티 50개를
 * 지우려면 50번의 CANCELLED 전이가 필요하고, 업체는 소프트 삭제만 된다.
 *
 * ── 두 가지 비동기 특성을 전제로 짰다 ────────────────────────────────────
 *
 * 1. Admin v2의 모든 GET은 `DB_ADMIN_00` 프로젝션을 읽는다. 큐로 갱신되므로
 *    방금 만든 리소스가 목록에 바로 안 보인다. 그래서 중복 방지는 GET이 아니라
 *    로컬 원장(scripts/seed-data/.seed-state.<env>.json)이 담당한다.
 * 2. `POST /parties/:id/transitions`도 같은 프로젝션을 읽는다. 생성 직후
 *    전이를 걸면 404가 난다. 그래서 전이는 404를 정상 상태로 보고 재시도한다.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  BUSINESSES,
  CATEGORIES,
  PARTIES,
  VENUES,
  partyImageSlug,
} from './seed-data/dopa-market-seed.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STATE_DIR = join(ROOT, 'scripts', 'seed-data');
const IMAGE_DIR = join(STATE_DIR, 'images');

const API_URLS = {
  staging: 'https://dopa-backend-staging.ceoofspot.workers.dev',
  production: 'https://api.dopa.ing',
};
const R2_BUCKETS = {
  staging: 'dopa-media-staging',
  production: 'dopa-media',
};
/**
 * 오브젝트를 공개로 서빙하는 주소. 각 버킷에 연결된 커스텀 도메인이다.
 *
 * staging 도메인은 이 시드를 위해 붙였다. 그전에는 커스텀 도메인도 r2.dev
 * 공개 접근도 없어서 올려도 앱이 읽지 못했다. `DOPA_MEDIA_PUBLIC_BASE`로
 * 덮어쓸 수 있다.
 */
const R2_PUBLIC_BASES = {
  staging: 'https://media-staging.dopa.ing',
  production: 'https://media.dopa.ing',
};
const PRODUCTION_ACK = 'I_ACKNOWLEDGE_PRODUCTION_SEED';

/** 뮤테이션 사이 간격. 어드민 라우트를 몰아치지 않기 위한 것. */
const THROTTLE_MS = 250;
/** 프로젝션이 따라잡기를 기다리는 전이 재시도. */
const TRANSITION_ATTEMPTS = 8;
const TRANSITION_BACKOFF_MS = 1500;

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// ─── 인자 ────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    env: null,
    apply: false,
    ack: null,
    status: 'RECRUITING',
    limit: null,
    images: 'auto',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--env') args.env = argv[++i] ?? null;
    else if (arg === '--ack') args.ack = argv[++i] ?? null;
    else if (arg === '--status') args.status = argv[++i] ?? null;
    else if (arg === '--images') args.images = argv[++i] ?? null;
    else if (arg === '--limit') args.limit = Number(argv[++i]);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`알 수 없는 인자: ${arg}`);
  }
  return args;
}

const USAGE = `
사용법: node scripts/seed-parties.mjs --env <staging|production> [옵션]

  --env <환경>       staging 또는 production (필수)
  --apply            실제로 등록한다. 없으면 계획만 출력하는 dry-run.
  --ack <문자열>     production에 --apply 할 때만 필요: ${PRODUCTION_ACK}
  --status <상태>    생성 후 전이할 상태. RECRUITING(기본) 또는 DRAFT.
                     DRAFT면 앱 검색에 노출되지 않는다.
  --images <모드>    auto(기본): 공개 주소가 있는 환경에서만 커버 이미지를
                     R2에 올려 붙인다. off: 이미지 없이 등록한다.
  --limit <n>        파티를 앞에서 n개만 등록한다 (연습용).

환경변수:
  DOPA_SEED_EMAIL          SUPER_ADMIN 계정 이메일 (필수)
  DOPA_SEED_PASSWORD       SUPER_ADMIN 계정 비밀번호 (필수)
  DOPA_API_URL             API 주소 직접 지정 (기본값은 --env로 결정)
  DOPA_MEDIA_PUBLIC_BASE   R2 공개 주소 직접 지정 (staging에 도메인을 붙였을 때)

이미지는 먼저 만들어 두어야 한다:
  node scripts/generate-seed-images.mjs
`.trim();

// ─── 일정 계산 ───────────────────────────────────────────────────────────

/**
 * KST 기준 "오늘" 자정을 UTC 밀리초로.
 *
 * 호스트 타임존에 의존하지 않기 위해 로컬 Date 생성자를 쓰지 않는다. CI나
 * UTC 서버에서 돌려도 파티 시작 시각이 9시간 밀리면 안 된다.
 */
function kstMidnightUtcMs(nowMs) {
  const shifted = nowMs + KST_OFFSET_MS;
  const day = Math.floor(shifted / 86_400_000);
  return day * 86_400_000 - KST_OFFSET_MS;
}

function kstWeekday(utcMs) {
  return new Date(utcMs + KST_OFFSET_MS).getUTCDay();
}

/**
 * `weekday` 요일의 `weekOffset`번째 다음 발생일에 KST `hour:minute`.
 *
 * 오늘/내일은 건너뛴다. 신청 마감이 시작보다 앞서야 하는데 당일 파티를
 * 만들면 마감 시각이 과거가 되기 때문이다.
 */
function resolveStart(nowMs, { weekday, weekOffset, startHour, startMinute }) {
  const base = kstMidnightUtcMs(nowMs) + 2 * 86_400_000;
  let cursor = base;
  while (kstWeekday(cursor) !== weekday) cursor += 86_400_000;
  cursor += (Math.max(1, weekOffset) - 1) * 7 * 86_400_000;
  return cursor + startHour * 3_600_000 + startMinute * 60_000;
}

/**
 * 파티 하나의 최종 API 페이로드.
 *
 * 마감 시각은 과거로 내려가지 않게 지금+1시간으로 끌어올린다. weekOffset이
 * 작은 회차에 긴 마감 여유(예: 72시간)를 주면 생성 순간 이미 마감된 파티가
 * 되는데, 시드 데이터로는 무의미하다.
 */
function buildPartyPayload(party, business, categoryId, nowMs) {
  const venue = VENUES[party.venue];
  if (venue === undefined) throw new Error(`알 수 없는 venue: ${party.venue}`);

  const startMs = resolveStart(nowMs, party);
  const endMs = startMs + party.durationMinutes * 60_000;
  const deadlineMs = Math.min(
    startMs,
    Math.max(startMs - party.deadlineHoursBefore * 3_600_000, nowMs + 3_600_000),
  );

  const description = [party.intro, '', business.flow, '', business.notice].join('\n');

  return {
    title: party.title,
    description,
    date: new Date(startMs).toISOString(),
    endsAt: new Date(endMs).toISOString(),
    applicationDeadline: new Date(deadlineMs).toISOString(),
    location: venue.location,
    placeName: venue.placeName,
    address: venue.address,
    placeLatitude: venue.latitude,
    placeLongitude: venue.longitude,
    maxCapacity: party.maxCapacity,
    maxMale: party.maxMale,
    maxFemale: party.maxFemale,
    genderRatio: party.genderRatio,
    priceMale: party.priceMale,
    priceFemale: party.priceFemale,
    admissionMode: party.admissionMode,
    interestLimit: party.interestLimit,
    minBirthYear: party.minBirthYear,
    maxBirthYear: party.maxBirthYear,
    ...(categoryId === null ? {} : { categoryId }),
    inclusions: (party.inclusions ?? business.inclusions).map((label) => ({ label })),
    faqs: party.faqs ?? business.faqs,
  };
}

// ─── 로컬 원장 ───────────────────────────────────────────────────────────

/**
 * 무엇을 이미 만들었는지 기록한다.
 *
 * 서버 목록 조회로 중복을 판단할 수 없기 때문에(프로젝션 지연) 이 파일이
 * 재실행 안전성의 근거다. 파일을 지우고 다시 돌리면 중복 생성된다.
 */
function statePath(env) {
  return join(STATE_DIR, `.seed-state.${env}.json`);
}

function loadState(env) {
  const path = statePath(env);
  if (!existsSync(path)) return { categories: {}, businesses: {}, parties: {} };
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return {
    categories: parsed.categories ?? {},
    businesses: parsed.businesses ?? {},
    parties: parsed.parties ?? {},
  };
}

function saveState(env, state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath(env), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

// ─── HTTP ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ApiError extends Error {
  constructor(status, body, path) {
    super(`${status} ${path} — ${body}`);
    this.status = status;
    this.body = body;
  }
}

class AdminClient {
  #baseUrl;
  #email;
  #password;
  #token = null;

  constructor(baseUrl, email, password) {
    this.#baseUrl = baseUrl.replace(/\/$/, '');
    this.#email = email;
    this.#password = password;
  }

  async login() {
    const response = await fetch(`${this.#baseUrl}/auth/v2/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.#email, password: this.#password, platform: 'web' }),
    });
    const text = await response.text();
    if (!response.ok) throw new ApiError(response.status, text, '/auth/v2/admin/login');
    const parsed = JSON.parse(text);
    this.#token = parsed.accessToken;
    if (parsed.admin?.role !== 'SUPER_ADMIN') {
      throw new Error(`SUPER_ADMIN 계정이 아닙니다 (role=${parsed.admin?.role ?? 'unknown'})`);
    }
    return parsed.admin;
  }

  /**
   * 401이면 한 번 재로그인하고 재시도한다.
   *
   * 액세스 토큰 수명이 짧고 이 스크립트는 100번 넘게 호출하므로 중간에
   * 만료될 수 있다. 리프레시 쿠키를 흉내내는 것보다 재로그인이 단순하다.
   */
  async request(path, init = {}, { retryAuth = true } = {}) {
    const response = await fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        Authorization: `Bearer ${this.#token}`,
        ...init.headers,
      },
    });

    if (response.status === 401 && retryAuth) {
      await this.login();
      return this.request(path, init, { retryAuth: false });
    }

    const text = await response.text();
    if (!response.ok) throw new ApiError(response.status, text, path);
    return text === '' ? null : JSON.parse(text);
  }

  get(path) {
    return this.request(path);
  }

  post(path, body) {
    return this.request(path, { method: 'POST', body: JSON.stringify(body) });
  }
}

// ─── 커버 이미지 ─────────────────────────────────────────────────────────

/**
 * 이 실행에서 이미지를 붙일 수 있는지, 없다면 왜인지.
 *
 * SUPER_ADMIN에게는 파티 이미지 업로드 API가 없다. 업로드 티켓을 발급하는
 * `POST /businesses/me/parties/media-upload-url`은 `requireMyBusinessAdmin()`
 * 뒤에 있어서 역할이 `ADMIN`이고 업체가 배정된 운영자만 통과한다. 그래서 이
 * 스크립트는 API 대신 wrangler로 R2에 직접 올리고, 파티에는 그 공개 URL만
 * 넘긴다 — `images`/`coverImage`는 URL 형식만 검사하므로 이 경로가 유효하다.
 */
function resolveImagePlan(env, mode) {
  if (mode === 'off') return { enabled: false, reason: '--images off' };

  const publicBase = process.env.DOPA_MEDIA_PUBLIC_BASE ?? R2_PUBLIC_BASES[env];
  if (publicBase === null || publicBase === undefined) {
    return {
      enabled: false,
      reason: `${R2_BUCKETS[env]} 버킷에 공개 주소가 없습니다 (커스텀 도메인·r2.dev 모두 비활성). DOPA_MEDIA_PUBLIC_BASE로 지정하면 붙입니다`,
    };
  }
  if (!existsSync(IMAGE_DIR)) {
    return {
      enabled: false,
      reason: '이미지가 없습니다 — 먼저 node scripts/generate-seed-images.mjs 를 실행하세요',
    };
  }
  return {
    enabled: true,
    bucket: R2_BUCKETS[env],
    publicBase: publicBase.replace(/\/$/, ''),
  };
}

/**
 * 커버 이미지를 R2에 올리고 공개 URL을 돌려준다.
 *
 * 오브젝트 키는 어드민 업로더와 같은 `parties/{businessId}/…` 규칙을 따른다.
 * 시드가 만든 것임을 알 수 있게 `seed-` 접두사를 붙여, 나중에 지울 때 운영자가
 * 올린 이미지와 섞이지 않게 한다.
 */
function uploadCoverImage(plan, businessId, slug, log) {
  const file = join(IMAGE_DIR, `${slug}.jpg`);
  if (!existsSync(file)) throw new Error(`커버 이미지가 없습니다: ${file}`);

  const objectKey = `parties/${businessId}/seed-${slug}.jpg`;
  const result = spawnSync(
    'npx',
    [
      '--no-install',
      'wrangler',
      'r2',
      'object',
      'put',
      `${plan.bucket}/${objectKey}`,
      `--file=${file}`,
      '--content-type=image/jpeg',
      '--remote',
    ],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim().split('\n').slice(-3).join(' ');
    throw new Error(`R2 업로드 실패 (${objectKey}) — ${detail}`);
  }
  log(`    ↑ 이미지 ${objectKey}`);
  return `${plan.publicBase}/${objectKey}`;
}

// ─── 등록 단계 ───────────────────────────────────────────────────────────

async function ensureCategories(client, state, log) {
  const existing = await client.get('/party-categories');
  const byName = new Map((existing.categories ?? []).map((row) => [row.name, row.id]));

  for (const category of CATEGORIES) {
    const known = byName.get(category.name) ?? state.categories[category.name];
    if (known !== undefined) {
      state.categories[category.name] = known;
      log(`  = 카테고리 유지  ${category.name}`);
      continue;
    }
    const created = await client.post('/admin/v2/party-categories', category);
    state.categories[category.name] = created.id;
    log(`  + 카테고리 생성  ${category.name}`);
    await sleep(THROTTLE_MS);
  }
}

async function ensureBusinesses(client, state, log) {
  for (const business of BUSINESSES) {
    if (state.businesses[business.key] !== undefined) {
      log(`  = 업체 유지  ${business.name}`);
      continue;
    }
    const created = await client.post('/admin/v2/businesses', {
      name: business.name,
      kind: business.kind,
      description: business.description,
      tagline: business.tagline,
      contactEmail: business.contactEmail,
      contactPhone: business.contactPhone,
      address: business.address,
      businessNumber: business.businessNumber,
      feeRateBps: business.feeRateBps,
      status: business.status,
    });
    state.businesses[business.key] = created.id;
    log(`  + 업체 생성  ${business.name}  (${created.id})`);
    await sleep(THROTTLE_MS);
  }
}

/**
 * DRAFT → RECRUITING.
 *
 * 404는 실패가 아니라 "프로젝션이 아직 이 파티를 모른다"는 뜻이므로 재시도
 * 대상이다. 그 외 오류는 즉시 올린다.
 */
async function promoteToRecruiting(client, partyId, version, log) {
  for (let attempt = 1; attempt <= TRANSITION_ATTEMPTS; attempt += 1) {
    try {
      await client.post(`/admin/v2/parties/${partyId}/transitions`, {
        toStatus: 'RECRUITING',
        expectedVersion: version,
        idempotencyKey: `seed-recruiting-${partyId}`,
        reason: '시드 데이터 모집 오픈',
      });
      return true;
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      if (attempt === TRANSITION_ATTEMPTS) {
        log(`    ! 모집 전환 보류 — 프로젝션 지연 (partyId=${partyId})`);
        return false;
      }
      await sleep(TRANSITION_BACKOFF_MS * attempt);
    }
  }
  return false;
}

async function createParties(client, state, { status, limit, imagePlan }, nowMs, log) {
  const targets = limit === null ? PARTIES : PARTIES.slice(0, limit);
  const pending = [];

  for (const party of targets) {
    const key = `${party.business}::${party.title}`;
    if (state.parties[key] !== undefined) {
      log(`  = 파티 유지  ${party.title}`);
      continue;
    }

    const business = BUSINESSES.find((row) => row.key === party.business);
    if (business === undefined) throw new Error(`알 수 없는 업체 키: ${party.business}`);
    const businessId = state.businesses[business.key];
    if (businessId === undefined) throw new Error(`업체가 아직 없습니다: ${business.name}`);

    const payload = buildPartyPayload(
      party,
      business,
      state.categories[party.category] ?? null,
      nowMs,
    );
    if (imagePlan.enabled) {
      const coverImage = uploadCoverImage(imagePlan, businessId, partyImageSlug(party), log);
      payload.coverImage = coverImage;
      payload.images = [coverImage];
    }
    const created = await client.post(
      `/admin/v2/businesses/${businessId}/parties`,
      payload,
    );
    state.parties[key] = created.id;
    log(
      `  + 파티 생성  ${party.title}  (${payload.date.slice(0, 16).replace('T', ' ')}Z)`,
    );
    if (status === 'RECRUITING') {
      pending.push({ id: created.id, version: created.operationalVersion ?? 0, title: party.title });
    }
    await sleep(THROTTLE_MS);
  }

  if (pending.length > 0) {
    log(`\n  모집 상태로 전환 중 (${pending.length}건)…`);
    let promoted = 0;
    for (const entry of pending) {
      if (await promoteToRecruiting(client, entry.id, entry.version, log)) promoted += 1;
      await sleep(THROTTLE_MS);
    }
    log(`  모집 전환 완료 ${promoted}/${pending.length}`);
  }
}

// ─── dry-run 출력 ────────────────────────────────────────────────────────

function printPlan(nowMs, { limit }, log) {
  log('업체');
  for (const business of BUSINESSES) {
    const count = PARTIES.filter((party) => party.business === business.key).length;
    log(`  · ${business.name.padEnd(8)} ${business.kind.padEnd(10)} 파티 ${count}개 — ${business.tagline}`);
  }

  const targets = limit === null ? PARTIES : PARTIES.slice(0, limit);
  log(`\n파티 ${targets.length}개`);
  for (const party of targets) {
    const business = BUSINESSES.find((row) => row.key === party.business);
    const payload = buildPartyPayload(party, business, null, nowMs);
    const startKst = new Date(Date.parse(payload.date) + KST_OFFSET_MS)
      .toISOString()
      .slice(0, 16)
      .replace('T', ' ');
    const price = `남 ${party.priceMale.toLocaleString()} / 여 ${party.priceFemale.toLocaleString()}`;
    log(
      `  · ${startKst} KST  ${party.admissionMode.padEnd(8)} ${String(party.maxCapacity).padStart(3)}명  ${price.padEnd(28)} ${party.title}`,
    );
  }

  const total = targets.reduce(
    (sum, party) => sum + party.priceMale * party.maxCapacity,
    0,
  );
  log(`\n정원 전량 판매 시 거래액: ${total.toLocaleString()}원`);
}

// ─── 진입점 ──────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    return;
  }

  if (args.env !== 'staging' && args.env !== 'production') {
    throw new Error(`--env는 staging 또는 production이어야 합니다\n\n${USAGE}`);
  }
  if (args.status !== 'RECRUITING' && args.status !== 'DRAFT') {
    throw new Error('--status는 RECRUITING 또는 DRAFT여야 합니다');
  }
  if (args.images !== 'auto' && args.images !== 'off') {
    throw new Error('--images는 auto 또는 off여야 합니다');
  }
  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error('--limit은 1 이상의 정수여야 합니다');
  }
  if (args.env === 'production' && args.apply && args.ack !== PRODUCTION_ACK) {
    throw new Error(
      `production에 등록하려면 --ack ${PRODUCTION_ACK} 를 함께 넘겨야 합니다`,
    );
  }

  const baseUrl = process.env.DOPA_API_URL ?? API_URLS[args.env];
  const nowMs = Date.now();
  const log = (line) => console.log(line);

  const imagePlan = resolveImagePlan(args.env, args.images);
  args.imagePlan = imagePlan;

  log(`대상 : ${baseUrl}  (${args.env})`);
  log(`모드 : ${args.apply ? '실행' : 'dry-run — 아무것도 등록하지 않습니다'}`);
  log(`상태 : 생성 후 ${args.status}`);
  log(
    imagePlan.enabled
      ? `이미지 : ${imagePlan.bucket} → ${imagePlan.publicBase}`
      : `이미지 : 생략 — ${imagePlan.reason}`,
  );
  log('');

  if (!args.apply) {
    printPlan(nowMs, args, log);
    log('\n실제로 등록하려면 --apply 를 붙이세요.');
    return;
  }

  const email = process.env.DOPA_SEED_EMAIL;
  const password = process.env.DOPA_SEED_PASSWORD;
  if (!email || !password) {
    throw new Error('DOPA_SEED_EMAIL / DOPA_SEED_PASSWORD 환경변수가 필요합니다');
  }

  const client = new AdminClient(baseUrl, email, password);
  const admin = await client.login();
  log(`로그인 : ${admin.email} (${admin.role})\n`);

  const state = loadState(args.env);
  try {
    await ensureCategories(client, state, log);
    log('');
    await ensureBusinesses(client, state, log);
    log('');
    await createParties(client, state, args, nowMs, log);
  } finally {
    // 중간에 실패해도 이미 만든 것은 기록해야 재실행이 중복을 만들지 않는다.
    saveState(args.env, state);
  }

  log(
    `\n완료 — 업체 ${Object.keys(state.businesses).length}곳 / 파티 ${Object.keys(state.parties).length}개`,
  );
  log(`원장 : ${statePath(args.env)}`);
}

main().catch((error) => {
  console.error(`\n실패: ${error.message}`);
  process.exitCode = 1;
});
