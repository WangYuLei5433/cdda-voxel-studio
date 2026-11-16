#!/usr/bin/env node
// Download CDDA's official translations (.po) for one experimental release into
// vendor/translations/<tag>/<lang>.po. The catalog generator reads them.
//
//   node tools/fetch-translations.mjs <release tag> [lang …]     (default langs: zh_CN ru)
//   e.g. node tools/fetch-translations.mjs cdda-experimental-2026-11-14-0749
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const [tag, ...langs] = process.argv.slice(2);
if (!tag || !/^cdda-experimental-[\d-]+$/.test(tag)) {
  console.error('usage: node tools/fetch-translations.mjs cdda-experimental-YYYY-MM-DD-HHMM [lang …]');
  process.exit(1);
}
const want = langs.length ? langs : ['zh_CN', 'ru'];
const out = join(ROOT, 'vendor/translations', tag);
mkdirSync(out, { recursive: true });
const asset = `cdda-translations-${tag.replace('cdda-experimental-', '')}.tar.gz`;
const work = mkdtempSync(join(tmpdir(), 'cdda-po-'));
try {
  const archive = join(work, asset);
  const url = `https://github.com/CleverRaven/Cataclysm-DDA/releases/download/${tag}/${asset}`;
  console.log(`Downloading ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  writeFileSync(archive, Buffer.from(await res.arrayBuffer()));
  for (const lang of want) {
    execFileSync('tar', ['-xzf', archive, '-C', work, `lang/po/${lang}.po`]);
    renameSync(join(work, `lang/po/${lang}.po`), join(out, `${lang}.po`));
    console.log(`  ${lang}.po`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
if (!existsSync(join(out, `${want[0]}.po`))) process.exit(1);
