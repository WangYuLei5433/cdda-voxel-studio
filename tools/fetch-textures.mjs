#!/usr/bin/env node
// Download the material textures Vox uses (floors, walls, wood, rock, bark…) from
// Poly Haven (CC0 1.0) into public/assets/textures/polyhaven/<key>.jpg. The 1k diffuse map
// is downscaled to 512 px with macOS `sips` when available (smaller repo, enough for tiles).
// Keys are what public/data/appearance.json "textures" refer to. Existing files are kept.
//
//   node tools/fetch-textures.mjs
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'public/assets/textures/polyhaven');

// key → Poly Haven asset id
const TEXTURES = {
  grass: 'leafy_grass',
  grass_dry: 'sparse_grass',
  forest: 'forest_ground_04',
  dirt: 'dirt',
  mud: 'brown_mud',
  sand: 'coast_sand_01',
  gravel: 'gravel',
  rock_ground: 'rock_ground',
  snow: 'snow_02',
  asphalt: 'asphalt_02',
  concrete: 'concrete_floor_worn_001',
  pavement: 'brick_pavement_02',
  wood_floor: 'wood_floor_worn',
  tiles: 'floor_tiles_06',
  carpet: 'dirty_carpet',
  metal_floor: 'metal_plate',
  brick_wall: 'brick_wall_02',
  plaster_wall: 'plastered_wall_02',
  wood_wall: 'wood_plank_wall',
  concrete_wall: 'dirty_concrete',
  stone_wall: 'stone_wall',
  rock_wall: 'rock_wall_08',
  metal_wall: 'corrugated_iron',
  wood: 'wood_table_worn',
  bark: 'bark_brown_01',
  leaves: 'forest_leaves_02',
  rock: 'rock_boulder_dry',
  fabric: 'fabric_leather_02',
};

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

mkdirSync(OUT, { recursive: true });
const credits = [];
for (const [key, id] of Object.entries(TEXTURES)) {
  const file = join(OUT, `${key}.jpg`);
  credits.push(`${key}.jpg — https://polyhaven.com/a/${id}`);
  if (existsSync(file)) continue;
  const files = await json(`https://api.polyhaven.com/files/${id}`);
  const url = (files.Diffuse ?? files.col_1)['1k'].jpg.url;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  try {
    execFileSync('sips', ['-Z', '512', file], { stdio: 'ignore' });
  } catch {
    // No sips (not macOS): keep the 1k file.
  }
  console.log(`${key} ← ${id}`);
}
writeFileSync(
  join(OUT, 'LICENSE.txt'),
  `Textures from Poly Haven (https://polyhaven.com), CC0 1.0 Universal (public domain).\n` +
    `https://polyhaven.com/license\n\n${credits.join('\n')}\n`,
);
