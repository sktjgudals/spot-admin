#!/usr/bin/env node
/**
 * 시드 파티에 갤러리 사진을 붙이고, 리스트용 catalog.thumbnail_key 를 채운다.
 *
 *   node scripts/backfill-party-images.mjs --env staging --apply
 *   node scripts/backfill-party-images.mjs --env production --apply --ack I_ACKNOWLEDGE_PRODUCTION_SEED
 */
import { existsSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const BACKEND = join(dirname(ROOT), 'spot-cloudflare-backend');
const GALLERY_DIR = join(ROOT, 'scripts', 'seed-data', 'gallery');
const PRODUCTION_ACK = 'I_ACKNOWLEDGE_PRODUCTION_SEED';

const ENV = {
  staging: {
    domain: 'dopa-domain-00-staging',
    catalog: 'dopa-catalog-00-staging',
    r2: 'dopa-media-staging',
    publicBase: 'https://media-staging.dopa.ing',
  },
  production: {
    domain: 'dopa-domain-00',
    catalog: 'dopa-catalog-00',
    r2: 'dopa-media',
    publicBase: 'https://media.dopa.ing',
  },
};

const GALLERY_BY_BUSINESS = {
  솔로살롱: ['solo-lounge-night.jpg', 'solo-brick-corner.jpg', 'solo-lakeside.jpg'],
  싱글스테이지: ['casual-hongdae-loft.jpg', 'solo-lounge-night.jpg', 'solo-brick-corner.jpg'],
  로테이트서울: ['rotation-tables.jpg', 'rotation-one-to-one.jpg', 'casual-hongdae-loft.jpg'],
  텐미닛서울: ['rotation-one-to-one.jpg', 'rotation-tables.jpg', 'prime-skyline.jpg'],
  프라임소셜: ['prime-whiskey.jpg', 'prime-champagne.jpg', 'prime-skyline.jpg'],
  한잔의밤: ['bar-euljiro.jpg', 'bar-communal.jpg', 'casual-hongdae-loft.jpg'],
  게하나이트: ['gh-gangneung-roof.jpg', 'gh-yangyang-bbq.jpg', 'gh-jeju-living.jpg'],
};

function parseArgs(argv) {
  const args = { env: null, apply: false, ack: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--env') args.env = argv[++i] ?? null;
    else if (arg === '--ack') args.ack = argv[++i] ?? null;
    else throw new Error(`알 수 없는 인자: ${arg}`);
  }
  return args;
}

function sqlString(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/gu, "''")}'`;
}

function wrangler(args) {
  const result = spawnSync('npx', ['--no-install', 'wrangler', ...args], {
    cwd: existsSync(BACKEND) ? BACKEND : ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(`wrangler 실패\n${`${result.stderr ?? ''}${result.stdout ?? ''}`.trim().slice(-1200)}`);
  }
  return result.stdout;
}

function d1Query(database, sql) {
  const out = wrangler(['d1', 'execute', database, '--remote', '--command', sql, '--json']);
  return JSON.parse(out.slice(out.indexOf('[')))[0].results ?? [];
}

function d1Exec(database, statements) {
  if (statements.length === 0) return;
  const file = join(mkdtempSync(join(tmpdir(), 'dopa-img-')), 'batch.sql');
  writeFileSync(file, `${statements.join(';\n')};\n`, 'utf8');
  wrangler(['d1', 'execute', database, '--remote', '--file', file]);
}

function upload(plan, filename) {
  const file = join(GALLERY_DIR, filename);
  if (!existsSync(file)) throw new Error(`갤러리 파일 없음: ${file}`);
  const objectKey = `parties/gallery/${filename}`;
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.env !== 'staging' && args.env !== 'production') {
    throw new Error('--env는 staging 또는 production');
  }
  if (args.env === 'production' && args.apply && args.ack !== PRODUCTION_ACK) {
    throw new Error(`production에는 --ack ${PRODUCTION_ACK}`);
  }
  const plan = ENV[args.env];
  const files = [...new Set(Object.values(GALLERY_BY_BUSINESS).flat())];
  console.log(`대상 : ${args.env}`);
  console.log(`갤러리 ${files.length}장 / 업체 ${Object.keys(GALLERY_BY_BUSINESS).length}곳`);
  if (!args.apply) {
    console.log('dry-run — --apply 로 올립니다.');
    return;
  }

  const urls = {};
  for (const filename of files) {
    urls[filename] = upload(plan, filename);
    console.log(`  ↑ ${filename}`);
  }

  const rows = d1Query(
    plan.domain,
    `SELECT p.id, p.business_id, b.name AS business_name, p.cover_image, p.title
       FROM parties p JOIN businesses b ON b.id = p.business_id
      WHERE p.cover_image IS NOT NULL`,
  );
  const partySql = [];
  const catalogSql = [];
  for (const row of rows) {
    const gallery = GALLERY_BY_BUSINESS[row.business_name];
    if (gallery === undefined) continue;
    const images = [row.cover_image, ...gallery.map((name) => urls[name])];
    partySql.push(
      `UPDATE parties SET images = ${sqlString(JSON.stringify(images))} WHERE id = ${sqlString(row.id)}`,
    );
    catalogSql.push(
      `UPDATE party_search_catalog SET thumbnail_key = ${sqlString(row.cover_image)}
        WHERE party_id = ${sqlString(row.id)}`,
    );
    console.log(`  · ${row.title}  이미지 ${images.length}장`);
  }
  for (let i = 0; i < partySql.length; i += 8) d1Exec(plan.domain, partySql.slice(i, i + 8));
  for (let i = 0; i < catalogSql.length; i += 8) d1Exec(plan.catalog, catalogSql.slice(i, i + 8));

  const filled = d1Query(
    plan.catalog,
    'SELECT COUNT(*) AS n FROM party_search_catalog WHERE thumbnail_key IS NOT NULL',
  )[0];
  console.log(`\n완료 — catalog thumbnail ${filled?.n}건`);
}

main();
