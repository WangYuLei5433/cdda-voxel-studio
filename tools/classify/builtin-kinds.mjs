// Which cataclysm-3d built-in model type (and material) each CDDA object uses, written to
// public/data/cdda/<version>/builtin-kinds.json for the studio to read.
//
// The rules are a port of cataclysm-3d's src/voxel_view.cpp (https://github.com/Risaro/cataclysm-3d,
// commit 875ae1f): monster_key() for monsters. That code is CC BY-SA 3.0, and so is this file
// and the table it writes (unlike the studio's own MIT code, which only reads the table).
// A table exported by cataclysm-3d itself would replace it: see docs/builtin-classification.md.
//
//   node tools/classify/builtin-kinds.mjs [version]     (default: the newest in index.json)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DIR = join(ROOT, 'public/data/cdda');
export const SOURCE = { repo: 'Risaro/cataclysm-3d', commit: '875ae1f396afc9db1f8238d570b1a06d10ba96d7', file: 'src/voxel_view.cpp' };

/** has_any(): the id contains any of the words. */
const hasAny = (id, ...words) => words.some((w) => id.includes(w));

/** monster_key() — species first; zombie animals by id. */
export function monsterKind(m) {
  const sp = new Set(m.species ?? []);
  const id = m.id;
  const animal = hasAny(id, 'cat', 'cougar', 'lynx', 'bobcat', 'panther', 'deer', 'moose', 'elk', 'caribou', 'bear', 'horse', 'cow', 'bull', 'bison', 'ox', 'mule', 'donkey', 'pony',
    'rabbit', 'squirrel', 'rat', 'mouse', 'groundhog', 'beaver', 'chipmunk', 'opossum', 'raccoon', 'mink', 'weasel', 'skunk', 'hare', 'vole', 'lemming', 'boar', 'pig', 'hog', 'sow',
    'dog', 'wolf', 'coyote', 'fox', 'jackal', 'hound');
  const undead = sp.has('ZOMBIE') || sp.has('GHOUL');
  if (undead && animal) return 'quadruped';
  if (undead) return 'zombie';
  if (sp.has('HUMAN') || sp.has('FERAL') || sp.has('CYBORG')) return 'humanoid';
  if (sp.has('ROBOT') || sp.has('ROBOT_FLYING')) return 'robot';
  if (sp.has('BIRD')) return 'bird';
  if (sp.has('INSECT_FLYING') || sp.has('SPIDER') || sp.has('CENTIPEDE') || sp.has('WORM') || sp.has('INSECT')) return 'bug';
  if (sp.has('FISH') || sp.has('AMPHIBIAN')) return 'fish';
  if (sp.has('MAMMAL') || sp.has('REPTILE')) return 'quadruped';
  if (sp.has('FUNGUS') || sp.has('PLANT') || sp.has('LEECH_PLANT')) return 'plant_creature';
  return 'blob';
}

/** The table for one catalog: { kind: { id: { builtin, material? } } }. */
export function builtinKinds(catalog) {
  const monster = Object.fromEntries(catalog.monster.map((m) => [m.id, { builtin: monsterKind(m) }]));
  return { source: SOURCE, license: 'CC BY-SA 3.0 (port of cataclysm-3d rules)', monster };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
  const version = index.versions.find((v) => v.id === process.argv[2]) ?? index.versions[0];
  const catalog = JSON.parse(readFileSync(join(DIR, version.path), 'utf8'));
  const table = builtinKinds(catalog);
  const out = join(DIR, version.id, 'builtin-kinds.json');
  writeFileSync(out, `${JSON.stringify(table)}\n`);
  const counts = {};
  for (const { builtin } of Object.values(table.monster)) counts[builtin] = (counts[builtin] ?? 0) + 1;
  console.log('wrote', out, counts);
}
