#!/usr/bin/env node
/**
 * 시장 조사 시드(업체 7 / 파티 50)를 D1에 직접 넣는다.
 *
 * Admin API 로그인이 없는 환경에서도 앱 검색·어드민 목록이 바로 채워지도록
 * domain + catalog + platform + admin snapshot 을 한 번에 맞춘다.
 *
 *   node scripts/seed-d1-market.mjs --env staging
 *   node scripts/seed-d1-market.mjs --env staging --apply
 *   node scripts/seed-d1-market.mjs --env production --apply --ack I_ACKNOWLEDGE_PRODUCTION_SEED
 */
import { existsSync, readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
const BACKEND = join(dirname(ROOT), 'spot-cloudflare-backend');
const STATE_DIR = join(ROOT, 'scripts', 'seed-data');
const IMAGE_DIR = join(STATE_DIR, 'images');
const PRODUCTION_ACK = 'I_ACKNOWLEDGE_PRODUCTION_SEED';
const EVENT_TTL_MS = 24 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const SEED_TAG = 'dopa-market-seed';
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

const ENV = {
  staging: {
    domain: 'dopa-domain-00-staging',
    catalog: 'dopa-catalog-00-staging',
    platform: 'dopa-platform-00-staging',
    admin: 'dopa-admin-00-staging',
    r2: 'dopa-media-staging',
    publicBase: 'https://media-staging.dopa.ing',
  },
  production: {
    domain: 'dopa-domain-00',
    catalog: 'dopa-catalog-00',
    platform: 'dopa-platform-00',
    admin: 'dopa-admin-00',
    r2: 'dopa-media',
    publicBase: 'https://media.dopa.ing',
  },
};

const REGION_PAIRS = [
  ['서울', 'KR-11'],
  ['부산', 'KR-26'],
  ['대구', 'KR-27'],
  ['인천', 'KR-28'],
  ['광주', 'KR-29'],
  ['대전', 'KR-30'],
  ['울산', 'KR-31'],
  ['세종', 'KR-36'],
  ['경기', 'KR-41'],
  ['강원', 'KR-42'],
  ['충북', 'KR-43'],
  ['충남', 'KR-44'],
  ['전북', 'KR-45'],
  ['전남', 'KR-46'],
  ['경북', 'KR-47'],
  ['경남', 'KR-48'],
  ['제주', 'KR-50'],
];

function parseArgs(argv) {
  const args = { env: null, apply: false, ack: null, images: 'auto' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--env') args.env = argv[++i] ?? null;
    else if (arg === '--ack') args.ack = argv[++i] ?? null;
    else if (arg === '--images') args.images = argv[++i] ?? null;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`알 수 없는 인자: ${arg}`);
  }
  return args;
}

function bucketOf(routingKey) {
  const bytes = new TextEncoder().encode(routingKey);
  let hash = FNV_OFFSET_BASIS;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, FNV_PRIME);
  }
  return (hash >>> 0) % 256;
}

function uuidv7(nowMs = Date.now()) {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const ts = BigInt(nowMs);
  for (let i = 0; i < 6; i += 1) {
    bytes[i] = Number((ts >> BigInt(40 - i * 8)) & 0xffn);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function regionCode(location) {
  return REGION_PAIRS.find(([prefix]) => location.startsWith(prefix))?.[1] ?? 'KR-11';
}

function kstMidnightUtcMs(nowMs) {
  return Math.floor((nowMs + KST_OFFSET_MS) / 86_400_000) * 86_400_000 - KST_OFFSET_MS;
}

function kstWeekday(utcMs) {
  return new Date(utcMs + KST_OFFSET_MS).getUTCDay();
}

function resolveStart(nowMs, party) {
  const base = kstMidnightUtcMs(nowMs) + 2 * 86_400_000;
  let cursor = base;
  while (kstWeekday(cursor) !== party.weekday) cursor += 86_400_000;
  cursor += (Math.max(1, party.weekOffset) - 1) * 7 * 86_400_000;
  return cursor + party.startHour * 3_600_000 + party.startMinute * 60_000;
}

function remainingSeats(maxForGender, countForGender, maxCapacity, currentCount) {
  const raw = maxForGender === null ? maxCapacity - currentCount : maxForGender - countForGender;
  return Math.max(0, raw);
}

function statePath(env) {
  return join(STATE_DIR, `.seed-state.${env}.json`);
}

function loadState(env) {
  const path = statePath(env);
  if (!existsSync(path)) return { categories: {}, businesses: {}, parties: {}, tag: SEED_TAG };
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveState(env, state) {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(statePath(env), `${JSON.stringify({ ...state, tag: SEED_TAG }, null, 2)}\n`, 'utf8');
}

function wrangler(args) {
  const result = spawnSync('npx', ['--no-install', 'wrangler', ...args], {
    cwd: existsSync(BACKEND) ? BACKEND : ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const detail = `${result.stderr ?? ''}${result.stdout ?? ''}`.trim().slice(-1200);
    throw new Error(`wrangler ${args.slice(0, 4).join(' ')} 실패\n${detail}`);
  }
  return result.stdout;
}

function d1Query(database, sql) {
  const out = wrangler(['d1', 'execute', database, '--remote', '--command', sql, '--json']);
  const start = out.indexOf('[');
  if (start < 0) return [];
  return JSON.parse(out.slice(start))[0].results ?? [];
}

function d1Exec(database, statements) {
  if (statements.length === 0) return;
  const dir = mkdtempSync(join(tmpdir(), 'dopa-seed-'));
  const file = join(dir, 'batch.sql');
  writeFileSync(file, `${statements.join(';\n')};\n`, 'utf8');
  wrangler(['d1', 'execute', database, '--remote', '--file', file]);
}

function d1ExecBatched(database, statements, size = 12) {
  for (let offset = 0; offset < statements.length; offset += size) {
    d1Exec(database, statements.slice(offset, offset + size));
    process.stdout.write(`    ${database} ${Math.min(offset + size, statements.length)}/${statements.length}\n`);
  }
}

function uploadCover(plan, businessId, slug) {
  const file = join(IMAGE_DIR, `${slug}.jpg`);
  if (!existsSync(file)) throw new Error(`커버 이미지가 없습니다: ${file}`);
  const objectKey = `parties/${businessId}/seed-${slug}.jpg`;
  wrangler([
    'r2',
    'object',
    'put',
    `${plan.r2}/${objectKey}`,
    `--file=${file}`,
    '--content-type=image/jpeg',
    '--remote',
  ]);
  return `${plan.publicBase}/${objectKey}`;
}

function rebuildAdminSnapshots(adminDb, resourceType, rows, generation, { searchFields, statusField, sortField }) {
  const current = d1Query(
    adminDb,
    `SELECT generation FROM admin_projection_watermarks WHERE resource_type = ${sqlString(resourceType)}`,
  )[0];
  if (current && Number(current.generation) >= generation) {
    generation = Number(current.generation) + 1;
  }

  d1Exec(adminDb, [
    `DELETE FROM admin_resource_snapshots WHERE resource_type = ${sqlString(resourceType)} AND generation = ${generation}`,
  ]);

  const inserts = rows.map((row) => {
    const id = String(row.id);
    const searchText = searchFields
      .map((field) => (row[field] == null ? '' : String(row[field])))
      .join(' ')
      .toLowerCase();
    const status = statusField ? (row[statusField] == null ? null : String(row[statusField])) : null;
    const rawSort = row[sortField];
    const sortKey = typeof rawSort === 'number' && Number.isFinite(rawSort) ? Math.trunc(rawSort) : 0;
    return `INSERT INTO admin_resource_snapshots
              (resource_type, resource_id, generation, sort_key, status, search_text, payload_json)
            VALUES (${sqlString(resourceType)}, ${sqlString(id)}, ${generation}, ${sortKey},
                    ${sqlString(status)}, ${sqlString(searchText)}, ${sqlString(JSON.stringify(row))})`;
  });
  d1ExecBatched(adminDb, inserts, 8);
  d1Exec(adminDb, [
    `INSERT INTO admin_projection_watermarks (resource_type, generation, row_count, updated_at)
     VALUES (${sqlString(resourceType)}, ${generation}, ${rows.length}, ${generation})
     ON CONFLICT(resource_type) DO UPDATE SET
       generation = excluded.generation,
       row_count = excluded.row_count,
       updated_at = excluded.updated_at
     WHERE excluded.generation > admin_projection_watermarks.generation`,
    `DELETE FROM admin_resource_snapshots WHERE resource_type = ${sqlString(resourceType)} AND generation < ${generation}`,
  ]);
}

function printPlan(nowMs) {
  console.log('업체');
  for (const business of BUSINESSES) {
    const count = PARTIES.filter((party) => party.business === business.key).length;
    console.log(`  · ${business.name}  ${business.kind}  파티 ${count}개  — ${business.tagline}`);
  }
  console.log(`\n파티 ${PARTIES.length}개`);
  for (const party of PARTIES) {
    const start = resolveStart(nowMs, party);
    const startKst = new Date(start + KST_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
    console.log(
      `  · ${startKst} KST  ${party.admissionMode.padEnd(8)} 남 ${party.priceMale.toLocaleString()} / 여 ${party.priceFemale.toLocaleString()}  ${party.title}`,
    );
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      '사용법: node scripts/seed-d1-market.mjs --env <staging|production> [--apply] [--ack I_ACKNOWLEDGE_PRODUCTION_SEED]',
    );
    return;
  }
  if (args.env !== 'staging' && args.env !== 'production') {
    throw new Error('--env는 staging 또는 production이어야 합니다');
  }
  if (args.env === 'production' && args.apply && args.ack !== PRODUCTION_ACK) {
    throw new Error(`production에는 --ack ${PRODUCTION_ACK} 가 필요합니다`);
  }

  const plan = ENV[args.env];
  const nowMs = Date.now();
  console.log(`대상 : ${args.env}`);
  console.log(`모드 : ${args.apply ? '실행' : 'dry-run'}`);
  console.log('');
  if (!args.apply) {
    printPlan(nowMs);
    console.log('\n실제로 넣으려면 --apply 를 붙이세요.');
    return;
  }

  const state = loadState(args.env);
  const existingBusinessNames = new Set(
    d1Query(plan.domain, 'SELECT name FROM businesses').map((row) => row.name),
  );
  const existingPartyTitles = new Set(
    d1Query(plan.domain, 'SELECT title FROM parties').map((row) => row.title),
  );
  const existingCategories = new Map(
    d1Query(plan.platform, 'SELECT id, name FROM party_categories').map((row) => [row.name, row.id]),
  );

  const categoryIds = { ...state.categories };
  const categorySql = [];
  for (const category of CATEGORIES) {
    const known = existingCategories.get(category.name) ?? categoryIds[category.name];
    if (known) {
      categoryIds[category.name] = known;
      console.log(`  = 카테고리 유지  ${category.name}`);
      continue;
    }
    const id = uuidv7(nowMs);
    categoryIds[category.name] = id;
    categorySql.push(
      `INSERT INTO party_categories (id,name,status,sort_order,icon_url,created_at,updated_at)
       VALUES (${sqlString(id)}, ${sqlString(category.name)}, ${sqlString(category.status)},
               ${category.sortOrder}, NULL, ${nowMs}, ${nowMs})`,
    );
    console.log(`  + 카테고리 생성  ${category.name}`);
  }
  d1ExecBatched(plan.platform, categorySql);
  state.categories = categoryIds;

  const businessIds = { ...state.businesses };
  const businessSql = [];
  for (const [index, business] of BUSINESSES.entries()) {
    if (businessIds[business.key] || existingBusinessNames.has(business.name)) {
      if (!businessIds[business.key]) {
        const row = d1Query(
          plan.domain,
          `SELECT id FROM businesses WHERE name = ${sqlString(business.name)} LIMIT 1`,
        )[0];
        if (row) businessIds[business.key] = row.id;
      }
      console.log(`  = 업체 유지  ${business.name}`);
      continue;
    }
    const id = uuidv7(nowMs + index + 10);
    const bucket = bucketOf(id);
    businessIds[business.key] = id;
    businessSql.push(
      `INSERT INTO businesses
         (id, bucket_id, business_id, name, kind, description, tagline,
          contact_email, contact_phone, address, business_number, status,
          fee_rate_bps, cover_images, created_at, updated_at)
       VALUES (${sqlString(id)}, ${bucket}, ${sqlString(id)}, ${sqlString(business.name)},
               ${sqlString(business.kind)}, ${sqlString(business.description)}, ${sqlString(business.tagline)},
               ${sqlString(business.contactEmail)}, ${sqlString(business.contactPhone)},
               ${sqlString(business.address)}, ${sqlString(business.businessNumber)},
               ${sqlString(business.status)}, ${business.feeRateBps}, '[]', ${nowMs}, ${nowMs})`,
    );
    console.log(`  + 업체 생성  ${business.name}  (${id})`);
  }
  d1ExecBatched(plan.domain, businessSql);
  state.businesses = businessIds;

  const useImages = args.images !== 'off' && existsSync(IMAGE_DIR);
  const partySql = [];
  const extraSql = [];
  const catalogSql = [];
  let createdParties = 0;

  for (const [index, party] of PARTIES.entries()) {
    const key = `${party.business}::${party.title}`;
    if (state.parties?.[key] || existingPartyTitles.has(party.title)) {
      console.log(`  = 파티 유지  ${party.title}`);
      continue;
    }
    const business = BUSINESSES.find((row) => row.key === party.business);
    const businessId = businessIds[party.business];
    if (!business || !businessId) throw new Error(`업체가 없습니다: ${party.business}`);
    const venue = VENUES[party.venue];
    const bucket = bucketOf(businessId);
    const id = uuidv7(nowMs + 200 + index);
    const startMs = resolveStart(nowMs, party);
    const endMs = startMs + party.durationMinutes * 60_000;
    const deadlineMs = Math.min(
      startMs,
      Math.max(startMs - party.deadlineHoursBefore * 3_600_000, nowMs + 3_600_000),
    );
    const description = [party.intro, '', business.flow, '', business.notice].join('\n');
    const region = regionCode(venue.address);
    const categoryId = categoryIds[party.category] ?? null;
    let coverImage = null;
    if (useImages) {
      try {
        coverImage = uploadCover(plan, businessId, partyImageSlug(party));
        console.log(`    ↑ 이미지 ${partyImageSlug(party)}.jpg`);
      } catch (error) {
        console.log(`    ! 이미지 생략  ${error.message.split('\n')[0]}`);
      }
    }
    const imagesJson = JSON.stringify(coverImage ? [coverImage] : []);
    const inclusions = party.inclusions ?? business.inclusions;
    const faqs = party.faqs ?? business.faqs;

    partySql.push(
      `INSERT INTO parties
         (id, business_id, bucket_id, title, description, location, region_code,
          starts_at, ends_at, application_deadline, max_capacity, current_count,
          admission_mode, interest_limit, cover_image, images,
          price_male, price_female, gender_ratio, category_id,
          place_name, address, place_latitude, place_longitude,
          max_male, max_female, min_birth_year, max_birth_year,
          status, status_version, is_active, projection_version,
          created_at, updated_at)
       VALUES (${sqlString(id)}, ${sqlString(businessId)}, ${bucket}, ${sqlString(party.title)},
               ${sqlString(description)}, ${sqlString(venue.location)}, ${sqlString(region)},
               ${startMs}, ${endMs}, ${deadlineMs}, ${party.maxCapacity}, 0,
               ${sqlString(party.admissionMode)}, ${party.interestLimit},
               ${sqlString(coverImage)}, ${sqlString(imagesJson)},
               ${party.priceMale}, ${party.priceFemale}, ${sqlString(party.genderRatio)},
               ${sqlString(categoryId)}, ${sqlString(venue.placeName)}, ${sqlString(venue.address)},
               ${venue.latitude}, ${venue.longitude},
               ${party.maxMale}, ${party.maxFemale}, ${party.minBirthYear}, ${party.maxBirthYear},
               'RECRUITING', 1, 1, 2, ${nowMs}, ${nowMs})`,
    );

    extraSql.push(
      `INSERT INTO party_status_transitions
         (id, business_id, bucket_id, party_id, from_status, to_status, version,
          actor_type, reason, idempotency_key, created_at)
       VALUES (${sqlString(uuidv7(nowMs + 400 + index))}, ${sqlString(businessId)}, ${bucket},
               ${sqlString(id)}, 'DRAFT', 'RECRUITING', 1, 'SYSTEM',
               ${sqlString('시드 데이터 모집 오픈')}, ${sqlString(`${SEED_TAG}-recruiting-${id}`)}, ${nowMs})`,
    );

    inclusions.forEach((label, sortOrder) => {
      extraSql.push(
        `INSERT INTO party_inclusions
           (id, business_id, bucket_id, party_id, label, sort_order, created_at, updated_at)
         VALUES (${sqlString(uuidv7(nowMs + 600 + index * 20 + sortOrder))}, ${sqlString(businessId)},
                 ${bucket}, ${sqlString(id)}, ${sqlString(label)}, ${sortOrder}, ${nowMs}, ${nowMs})`,
      );
    });
    faqs.forEach((faq, sortOrder) => {
      extraSql.push(
        `INSERT INTO party_faqs
           (id, business_id, bucket_id, party_id, question, answer, sort_order, created_at, updated_at)
         VALUES (${sqlString(uuidv7(nowMs + 800 + index * 20 + sortOrder))}, ${sqlString(businessId)},
                 ${bucket}, ${sqlString(id)}, ${sqlString(faq.question)}, ${sqlString(faq.answer)},
                 ${sortOrder}, ${nowMs}, ${nowMs})`,
      );
    });

    const payload = {
      partyId: id,
      businessId,
      title: party.title,
      regionCode: region,
      startsAt: startMs,
      location: venue.location,
      priceMale: party.priceMale,
      priceFemale: party.priceFemale,
      maxCapacity: party.maxCapacity,
      currentCount: 0,
      maleCount: 0,
      femaleCount: 0,
      maxMale: party.maxMale,
      maxFemale: party.maxFemale,
      status: 'RECRUITING',
      version: 2,
      updatedAt: nowMs,
    };
    extraSql.push(
      `INSERT INTO event_outbox
         (event_id, aggregate_type, aggregate_id, bucket_id, event_type, schema_version,
          payload_json, occurred_at, available_at, expires_at)
       VALUES (${sqlString(uuidv7(nowMs + 1000 + index))}, 'business', ${sqlString(businessId)},
               ${bucket}, 'PartyProjectionUpdated', 1, ${sqlString(JSON.stringify(payload))},
               ${nowMs}, ${nowMs}, ${nowMs + EVENT_TTL_MS})`,
    );

    catalogSql.push(
      `INSERT INTO party_search_catalog
         (party_id, business_id, title, region_code, geohash, starts_at,
          min_age, max_age, male_remaining, female_remaining, price, status,
          thumbnail_key, version, updated_at,
          location, price_male, price_female, max_capacity, current_count,
          male_count, female_count, max_male, max_female)
       VALUES (${sqlString(id)}, ${sqlString(businessId)}, ${sqlString(party.title)},
               ${sqlString(region)}, NULL, ${startMs}, NULL, NULL,
               ${remainingSeats(party.maxMale, 0, party.maxCapacity, 0)},
               ${remainingSeats(party.maxFemale, 0, party.maxCapacity, 0)},
               ${Math.min(party.priceMale, party.priceFemale)}, 'RECRUITING',
               ${sqlString(coverImage)}, 2, ${nowMs},
               ${sqlString(venue.location)}, ${party.priceMale}, ${party.priceFemale},
               ${party.maxCapacity}, 0, 0, 0, ${party.maxMale}, ${party.maxFemale})
       ON CONFLICT(party_id) DO UPDATE SET
         title = excluded.title,
         status = excluded.status,
         version = excluded.version,
         updated_at = excluded.updated_at
       WHERE party_search_catalog.version < excluded.version`,
    );

    state.parties = state.parties ?? {};
    state.parties[key] = id;
    createdParties += 1;
    console.log(`  + 파티 준비  ${party.title}`);
  }

  console.log('\n  domain parties …');
  d1ExecBatched(plan.domain, partySql, 4);
  console.log('  domain extras …');
  d1ExecBatched(plan.domain, extraSql, 8);
  console.log('  catalog …');
  d1ExecBatched(plan.catalog, catalogSql, 6);

  console.log('\n  admin snapshots …');
  const generation = Date.now();
  const businessRows = d1Query(
    plan.domain,
    `SELECT b.id, b.name, b.kind, b.description, b.tagline,
            b.logo_url AS logoUrl, b.cover_images AS coverImages,
            b.average_rating AS averageRating, b.review_count AS reviewCount,
            b.temperature, b.follower_count AS followerCount,
            b.participation_guide AS participationGuide,
            b.contact_email AS contactEmail, b.contact_phone AS contactPhone,
            b.address, b.business_number AS businessNumber, b.status,
            b.deleted_at AS deletedAt, b.fee_rate_bps AS feeRateBps,
            b.created_at AS createdAt, b.updated_at AS updatedAt,
            (SELECT COUNT(*) FROM parties p WHERE p.business_id = b.id) AS partyCount
       FROM businesses b ORDER BY b.created_at DESC`,
  ).map((row) => {
    let coverImages = [];
    try {
      coverImages = JSON.parse(row.coverImages ?? '[]');
    } catch {
      coverImages = [];
    }
    return { ...row, coverImages };
  });
  const partyRows = d1Query(
    plan.domain,
    `SELECT p.id, p.business_id AS businessId, b.name AS businessName,
            p.title, p.description, p.starts_at AS startsAt, p.ends_at AS endsAt,
            p.status, p.status_version AS statusVersion, p.location,
            p.max_capacity AS maxCapacity, p.current_count AS currentCount,
            p.is_active AS isActive, p.closed_at AS closedAt,
            p.cover_image AS coverImage, p.images, p.price_male AS priceMale,
            p.price_female AS priceFemale, p.category_id AS categoryId,
            p.place_name AS placeName, p.address, p.admission_mode AS admissionMode,
            p.view_count AS viewCount, p.created_at AS createdAt, p.updated_at AS updatedAt
       FROM parties p JOIN businesses b ON b.id = p.business_id
      ORDER BY p.starts_at DESC`,
  ).map((row) => {
    let images = [];
    try {
      images = JSON.parse(row.images ?? '[]');
    } catch {
      images = [];
    }
    return { ...row, isActive: row.isActive === 1, images };
  });
  const categoryRows = d1Query(
    plan.platform,
    `SELECT id, name, status, sort_order AS sortOrder, icon_url AS iconUrl,
            created_at AS createdAt, updated_at AS updatedAt
       FROM party_categories ORDER BY sort_order ASC`,
  );

  rebuildAdminSnapshots(plan.admin, 'businesses', businessRows, generation, {
    searchFields: ['name', 'contactEmail', 'businessNumber', 'id'],
    statusField: 'status',
    sortField: 'createdAt',
  });
  rebuildAdminSnapshots(plan.admin, 'parties', partyRows, generation + 1, {
    searchFields: ['title', 'businessName', 'location', 'address', 'id'],
    statusField: 'status',
    sortField: 'startsAt',
  });
  rebuildAdminSnapshots(plan.admin, 'party-categories', categoryRows, generation + 2, {
    searchFields: ['name', 'id'],
    statusField: 'status',
    sortField: 'sortOrder',
  });

  saveState(args.env, state);

  const businessCount = d1Query(plan.domain, 'SELECT COUNT(*) AS n FROM businesses')[0]?.n;
  const partyCount = d1Query(plan.domain, "SELECT COUNT(*) AS n FROM parties WHERE status = 'RECRUITING'")[0]?.n;
  const catalogCount = d1Query(
    plan.catalog,
    "SELECT COUNT(*) AS n FROM party_search_catalog WHERE status = 'RECRUITING'",
  )[0]?.n;
  console.log(
    `\n완료 — 이번 실행 파티 ${createdParties}개 / DB 업체 ${businessCount} / 모집중 파티 ${partyCount} / 카탈로그 ${catalogCount}`,
  );
  console.log(`원장 : ${statePath(args.env)}`);
}

main().catch((error) => {
  console.error(`\n실패: ${error.message}`);
  process.exitCode = 1;
});
