#!/usr/bin/env node
// Download cataclysm-3d's starter voxel set (every built-in model as a .vox, with its
// voxelset.json) into vendor/voxel/starter/, pinned to one commit. Not committed here until
// its license is confirmed; the studio can open it as a voxel set.
//
//   node tools/fetch-voxel-starter.mjs [commit]
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const REPO = 'Risaro/cataclysm-3d';
const COMMIT = process.argv[2] ?? '875ae1f396afc9db1f8238d570b1a06d10ba96d7';
const PREFIX = 'gfx/voxel/starter/';
const OUT = join(ROOT, 'vendor/voxel/starter');

const tree = await (await fetch(`https://api.github.com/repos/${REPO}/git/trees/${COMMIT}?recursive=1`, { headers: { Accept: 'application/vnd.github+json' } })).json();
if (!Array.isArray(tree.tree)) throw new Error(`cannot list ${REPO}@${COMMIT}: ${tree.message ?? 'unknown error'}`);
const files = tree.tree.filter((f) => f.type === 'blob' && f.path.startsWith(PREFIX)).map((f) => f.path);
let fetched = 0;
for (const path of files) {
  const dest = join(OUT, path.slice(PREFIX.length));
  if (existsSync(dest)) continue;
  const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${COMMIT}/${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  fetched++;
}
writeFileSync(join(OUT, 'SOURCE.txt'), `https://github.com/${REPO}/tree/${COMMIT}/${PREFIX}\n`);
console.log(`${files.length} files (${fetched} downloaded) in ${OUT}`);
