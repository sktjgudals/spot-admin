#!/usr/bin/env node
/**
 * 시드 파티 50개의 커버 이미지를 만든다.
 *
 *   node scripts/generate-seed-images.mjs
 *
 * 파티 데이터에서 매니페스트를 뽑아 Pillow 렌더러(scripts/seed-images/build-images.py)
 * 에 넘긴다. 렌더링을 파이썬에 맡긴 이유는 단순하다 — 이 맥에서 쓸 수 있는
 * 래스터라이저가 Pillow뿐이다(ImageMagick·rsvg 없음).
 *
 * 결과물은 scripts/seed-data/images/ 에 쌓이고 gitignore 대상이다. 50장 3MB
 * 남짓을 저장소에 넣는 대신, 이 스크립트로 언제든 똑같이 다시 만든다.
 */
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { BUSINESSES, PARTIES, VENUES, partyImageSlug } from './seed-data/dopa-market-seed.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT_DIR = join(ROOT, 'scripts', 'seed-data', 'images');
const RENDERER = join(ROOT, 'scripts', 'seed-images', 'build-images.py');

export function buildManifest() {
  return PARTIES.map((party) => {
    const business = BUSINESSES.find((row) => row.key === party.business);
    const venue = VENUES[party.venue];
    return {
      slug: partyImageSlug(party),
      title: party.title.replace(/^\[[^\]]*\]\s*/u, ''),
      category: party.category,
      admissionMode: party.admissionMode,
      businessName: business.name,
      location: venue.location,
      placeName: venue.placeName,
      maxCapacity: party.maxCapacity,
      priceMale: party.priceMale,
      priceFemale: party.priceFemale,
    };
  });
}

function main() {
  const manifest = buildManifest();
  const slugs = new Set(manifest.map((entry) => entry.slug));
  if (slugs.size !== manifest.length) {
    throw new Error('이미지 slug가 중복되었습니다 — 덮어쓰기가 발생합니다');
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const manifestPath = join(OUT_DIR, 'manifest.json');
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const result = spawnSync('python3', [RENDERER, manifestPath, OUT_DIR], {
    stdio: 'inherit',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) throw new Error(`이미지 렌더링 실패 (exit ${result.status})`);

  const written = readdirSync(OUT_DIR).filter((name) => name.endsWith('.jpg'));
  if (written.length !== manifest.length) {
    throw new Error(`이미지 ${manifest.length}장을 기대했지만 ${written.length}장이 생성되었습니다`);
  }
  console.log(`\n출력 : ${OUT_DIR}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
