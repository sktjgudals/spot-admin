/**
 * 시드 데이터가 백엔드 스키마를 실제로 통과하는지 로컬에서 검증한다.
 *
 * 여기 적힌 상한/하한은 `spot-cloudflare-backend`의 `admin-v2.ts`
 * (`businessSchema`, `partyFields`, `categorySchema`)를 그대로 옮긴 것이다.
 * 50건을 API에 던져 보고 나서야 "제목이 201자였다"를 알게 되는 상황을 막는
 * 것이 목적이다 — 그때는 이미 앞의 몇 건이 등록된 뒤다.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BUSINESSES,
  CATEGORIES,
  PARTIES,
  VENUES,
  partyImageSlug,
} from './seed-data/dopa-market-seed.mjs';
import { buildManifest } from './generate-seed-images.mjs';

// 일정 계산은 seed-parties.mjs에서 가져오지 않고 여기서 다시 구현한다. 그
// 파일은 import되는 순간 main()을 실행하는 실행 스크립트라, 테스트가 import
// 하는 것만으로 API를 호출하게 된다.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

function kstMidnightUtcMs(nowMs) {
  const shifted = nowMs + KST_OFFSET_MS;
  return Math.floor(shifted / 86_400_000) * 86_400_000 - KST_OFFSET_MS;
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

function payloadFor(party, nowMs) {
  const business = BUSINESSES.find((row) => row.key === party.business);
  const venue = VENUES[party.venue];
  const startMs = resolveStart(nowMs, party);
  const endMs = startMs + party.durationMinutes * 60_000;
  const deadlineMs = Math.min(
    startMs,
    Math.max(startMs - party.deadlineHoursBefore * 3_600_000, nowMs + 3_600_000),
  );
  return {
    business,
    venue,
    startMs,
    endMs,
    deadlineMs,
    description: [party.intro, '', business.flow, '', business.notice].join('\n'),
    inclusions: party.inclusions ?? business.inclusions,
    faqs: party.faqs ?? business.faqs,
  };
}

test('파티는 정확히 50개이고 제목이 중복되지 않는다', () => {
  assert.equal(PARTIES.length, 50);
  const titles = new Set(PARTIES.map((party) => `${party.business}::${party.title}`));
  assert.equal(titles.size, 50);
});

test('업체는 businessSchema를 통과한다', () => {
  const keys = new Set();
  for (const business of BUSINESSES) {
    assert.ok(!keys.has(business.key), `업체 키 중복: ${business.key}`);
    keys.add(business.key);

    assert.ok(business.name.length >= 1 && business.name.length <= 200, business.name);
    assert.ok(['INDIVIDUAL', 'COMPANY'].includes(business.kind), business.name);
    assert.ok(business.description.length <= 10_000, business.name);
    assert.ok(business.tagline.length <= 300, business.name);
    assert.match(business.contactEmail, /^[^@\s]+@[^@\s]+\.[^@\s]+$/, business.name);
    assert.ok(business.contactPhone.length <= 50, business.name);
    assert.ok(business.address.length <= 500, business.name);
    assert.ok(business.businessNumber.length <= 100, business.name);
    assert.ok(
      Number.isInteger(business.feeRateBps) &&
        business.feeRateBps >= 0 &&
        business.feeRateBps <= 10_000,
      business.name,
    );
    assert.ok(
      ['PENDING', 'ACTIVE', 'SUSPENDED', 'DISABLED'].includes(business.status),
      business.name,
    );
  }
});

test('카테고리는 categorySchema를 통과하고 앱 폴백 목록과 일치한다', () => {
  // party_filter_applier.dart / home_page.dart의 폴백 이름. 여기서 어긋나면
  // 앱 필터가 시드 파티를 하나도 못 찾는다.
  assert.deepEqual(
    CATEGORIES.map((category) => category.name),
    ['소셜 모임', '네트워킹 모임', '취미 모임', '여행 모임'],
  );
  for (const category of CATEGORIES) {
    assert.ok(category.name.length >= 1 && category.name.length <= 100);
    assert.ok(['FIXED', 'ACTIVE', 'HIDDEN'].includes(category.status));
    assert.ok(
      Number.isInteger(category.sortOrder) &&
        category.sortOrder >= 0 &&
        category.sortOrder <= 10_000,
    );
  }
});

test('파티는 partyFields와 superRefine을 통과한다', () => {
  const nowMs = Date.now();
  const categoryNames = new Set(CATEGORIES.map((category) => category.name));

  for (const party of PARTIES) {
    const label = party.title;
    const built = payloadFor(party, nowMs);

    assert.ok(built.business !== undefined, `알 수 없는 업체 키: ${party.business}`);
    assert.ok(built.venue !== undefined, `알 수 없는 venue: ${party.venue}`);
    assert.ok(categoryNames.has(party.category), `알 수 없는 카테고리: ${party.category}`);

    assert.ok(party.title.length >= 1 && party.title.length <= 200, label);
    assert.ok(built.description.length >= 1 && built.description.length <= 10_000, label);
    assert.ok(built.venue.location.length >= 1 && built.venue.location.length <= 500, label);
    assert.ok(built.venue.placeName.length <= 500, label);
    assert.ok(built.venue.address.length <= 1000, label);
    assert.ok(built.venue.latitude >= -90 && built.venue.latitude <= 90, label);
    assert.ok(built.venue.longitude >= -180 && built.venue.longitude <= 180, label);

    assert.ok(
      Number.isInteger(party.maxCapacity) && party.maxCapacity >= 1 && party.maxCapacity <= 1000,
      label,
    );
    assert.ok(Number.isInteger(party.priceMale) && party.priceMale >= 0, label);
    assert.ok(Number.isInteger(party.priceFemale) && party.priceFemale >= 0, label);
    assert.ok(['INSTANT', 'APPROVAL'].includes(party.admissionMode), label);
    assert.ok(
      Number.isInteger(party.interestLimit) &&
        party.interestLimit >= 1 &&
        party.interestLimit <= 100,
      label,
    );
    assert.ok(party.genderRatio === undefined || party.genderRatio.length <= 100, label);
    assert.ok(
      party.minBirthYear === undefined ||
        (party.minBirthYear >= 1900 && party.minBirthYear <= 2100),
      label,
    );
    assert.ok(
      party.maxBirthYear === undefined ||
        (party.maxBirthYear >= 1900 && party.maxBirthYear <= 2100),
      label,
    );
    if (party.minBirthYear !== undefined && party.maxBirthYear !== undefined) {
      assert.ok(party.minBirthYear <= party.maxBirthYear, `출생연도 범위 역전: ${label}`);
    }

    assert.ok(built.inclusions.length <= 50, label);
    for (const item of built.inclusions) {
      assert.ok(item.trim().length >= 1 && item.length <= 300, `${label} — ${item}`);
    }
    assert.ok(built.faqs.length <= 50, label);
    for (const faq of built.faqs) {
      assert.ok(faq.question.trim().length >= 1 && faq.question.length <= 500, label);
      assert.ok(faq.answer.trim().length >= 1 && faq.answer.length <= 2000, label);
    }

    // superRefine
    assert.ok(built.endMs > built.startMs, `종료가 시작보다 빠름: ${label}`);
    assert.ok(built.deadlineMs <= built.startMs, `마감이 시작보다 늦음: ${label}`);
  }
});

test('성별 정원을 사용하지 않고 전체 정원만 사용한다', () => {
  for (const party of PARTIES) {
    assert.equal(party.maxMale, undefined, party.title);
    assert.equal(party.maxFemale, undefined, party.title);
    assert.equal(party.genderRatio, undefined, party.title);
  }
});

test('모든 파티가 미래이고 신청 마감이 아직 남아 있다', () => {
  const nowMs = Date.now();
  for (const party of PARTIES) {
    const built = payloadFor(party, nowMs);
    assert.ok(built.startMs > nowMs, `시작 시각이 과거: ${party.title}`);
    assert.ok(built.deadlineMs > nowMs, `신청 마감이 과거: ${party.title}`);
  }
});

test('주소는 regionCode가 KR-11로 뭉개지지 않는 접두사로 시작한다', () => {
  // 백엔드 regionCode()는 주소 접두사를 순서대로 매칭하고, 못 찾으면 서울로
  // 떨어뜨린다. 부산 파티가 서울 지역 필터에 잡히면 지역 검색이 거짓말이 된다.
  const prefixes = [
    '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
    '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
  ];
  for (const [key, venue] of Object.entries(VENUES)) {
    const matched = prefixes.find((prefix) => venue.address.startsWith(prefix));
    assert.ok(matched !== undefined, `지역 접두사 없음: ${key} — ${venue.address}`);
    assert.ok(venue.location.startsWith(matched), `location/address 지역 불일치: ${key}`);
  }
});

test('커버 이미지 slug는 파티마다 유일하고 파일명·URL로 안전하다', () => {
  const slugs = PARTIES.map((party) => partyImageSlug(party));
  assert.equal(new Set(slugs).size, PARTIES.length, 'slug 중복 — 이미지가 서로 덮어쓴다');
  for (const slug of slugs) {
    // R2 오브젝트 키와 파일명에 그대로 들어가므로 인코딩이 필요한 문자는 금지.
    assert.match(slug, /^[a-z0-9-]+$/u, `안전하지 않은 slug: ${slug}`);
  }
});

test('이미지 매니페스트가 파티와 1:1로 대응한다', () => {
  const manifest = buildManifest();
  assert.equal(manifest.length, PARTIES.length);
  assert.deepEqual(
    manifest.map((entry) => entry.slug),
    PARTIES.map((party) => partyImageSlug(party)),
  );
  for (const entry of manifest) {
    assert.ok(entry.title.length >= 1, entry.slug);
    // 렌더러가 지역 접두사([강남] 등)를 떼고 그리므로, 떼고도 제목이 남아야 한다.
    assert.ok(!entry.title.startsWith('['), `지역 접두사가 남았다: ${entry.slug}`);
    assert.ok(entry.businessName.length >= 1, entry.slug);
  }
});

test('모든 venue가 최소 한 번은 쓰인다', () => {
  const used = new Set(PARTIES.map((party) => party.venue));
  for (const key of Object.keys(VENUES)) {
    assert.ok(used.has(key), `쓰이지 않는 venue: ${key}`);
  }
});
