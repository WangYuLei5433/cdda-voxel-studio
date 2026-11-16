#!/usr/bin/env node
// Download the open-licensed 3D models Vox uses into
// public/assets/models/<pack>/, resolving .gltf dependencies (.bin, textures):
//   KayKit by Kay Lousberg — CC0 1.0; Khronos "Fox" sample — CC0 mesh, CC-BY 4.0 rig/animation.
// Licenses are copied next to each pack. Re-run to update; existing files are kept.
//
//   node tools/fetch-assets.mjs
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'public/assets/models');
const KAYKIT = 'https://raw.githubusercontent.com/KayKit-Game-Assets';

// Each pack: raw base URL for files, license file, files relative to `base`.
const kaykit = (repo, addon, files) => ({
  root: `${KAYKIT}/${repo}/main/addons/${addon}`,
  license: `${KAYKIT}/${repo}/main/LICENSE.txt`,
  files,
});
const gl = (dir, names) => names.map((n) => `${dir}/${n}.gltf`);

const PACKS = {
  adventurers: kaykit('KayKit-Character-Pack-Adventures-1.0', 'kaykit_character_pack_adventures', [
    'Characters/gltf/Knight.glb',
    'Characters/gltf/Barbarian.glb',
    'Characters/gltf/Mage.glb',
    'Characters/gltf/Rogue.glb',
    'Characters/gltf/Rogue_Hooded.glb',
    ...gl('Assets/gltf', ['sword_1handed', 'axe_1handed', 'crossbow_1handed', 'dagger', 'shield_round', 'spellbook_closed', 'mug_full']),
  ]),
  skeletons: kaykit('KayKit-Character-Pack-Skeletons-1.0', 'kaykit_character_pack_skeletons', [
    'Characters/gltf/Skeleton_Minion.glb',
    'Characters/gltf/Skeleton_Warrior.glb',
    'Characters/gltf/Skeleton_Rogue.glb',
    'Characters/gltf/Skeleton_Mage.glb',
  ]),
  furniture: kaykit('KayKit-Furniture-Bits-1.0', 'kaykit_furniture_bits', gl('Assets/gltf', [
    'armchair', 'bed_single_A', 'bed_double_A', 'book_set', 'cabinet_medium', 'cabinet_small', 'chair_A',
    'couch', 'lamp_standing', 'lamp_table', 'rug_rectangle_A', 'shelf_B_large_decorated', 'shelf_A_big',
    'table_medium', 'table_small', 'table_low',
  ])),
  city: kaykit('KayKit-City-Builder-Bits-1.0', 'kaykit_city_builder_bits', gl('Assets/gltf', [
    'bench', 'box_A', 'bush', 'car_hatchback', 'car_sedan', 'car_police', 'dumpster', 'firehydrant',
    'streetlight', 'trash_A', 'watertower',
  ])),
  nature: kaykit('KayKit-Medieval-Hexagon-Pack-1.0', 'kaykit_medieval_hexagon_pack', [
    ...gl('Assets/gltf/decoration/nature', ['tree_single_A', 'tree_single_B', 'trees_A_small', 'rock_single_A', 'rock_single_C']),
    ...gl('Assets/gltf/buildings/neutral', ['fence_wood_straight', 'fence_stone_straight']),
  ]),
  halloween: kaykit('KayKit-Halloween-Bits-1.0', 'kaykit_halloween_bits', gl('Assets/gltf', [
    'tree_dead_medium', 'tree_dead_small', 'grave_A', 'gravestone', 'fence', 'fence_gate',
  ])),
  kitchen: kaykit('KayKit-Restaurant-Bits-1.0', 'kaykit_restaurant_bits', gl('Assets/gltf', [
    'fridge_A', 'oven', 'stove_single', 'kitchencounter_straight_A', 'kitchencounter_sink', 'kitchencabinet',
    'crate', 'food_dinner', 'jar_A_medium', 'pot_A', 'door_A',
  ])),
  dungeon: kaykit('KayKit-Dungeon-Remastered-1.0', 'kaykit_dungeon_remastered', [
    ...['barrel_large', 'barrel_small', 'box_large', 'box_small', 'bottle_A_brown', 'candle'].map((n) => `Assets/gltf/${n}.gltf.glb`),
    'Assets/gltf/chest.glb',
  ]),
  prototype: kaykit('KayKit-Prototype-Bits-1.0', 'kaykit_prototype_bits', gl('Assets/gltf', ['Primitive_Stairs', 'Pallet_Small', 'Door_A'])),
  // Quaternius animated animals (CC0), hosted on Poly Pizza; page → static GLB verified
  // 2026-11-15 (creator "Quaternius", licence "CC0 1.0").
  'animals-quaternius': {
    direct: {
      'Wolf.glb': ['XU7oNeKShV', '2cd00c92-295b-4652-b1a3-c3a1394e5d83'],
      'Dog.glb': ['2kUk0QqpCg', 'de55d76a-f578-4979-97ff-2a62edac32f3'],
      'Cat.glb': ['2f54vbV0In', '7ccb71fe-dabb-4a6f-a98a-8992bb5e6bc7'],
      'Horse.glb': ['D3hAeqeDBE', '52b9bf67-bf41-4aec-a4ff-e93e630289f2'],
      'Donkey.glb': ['qmX6nhnvp7', 'ca29f94e-0874-41b6-8334-66642af56a61'],
      'Sheep.glb': ['rgJXF570ZK', 'd42145b6-ae20-48cd-ba36-63b03f901c32'],
      'Chicken.glb': ['Z3RCoCYss4', '9ba093a4-6525-4f3b-927d-98dca72e1e40'],
      'Rat.glb': ['iltq5bVNaV', '64cb7150-8031-44ab-a0c9-e1529a572b23'],
      'Raccoon.glb': ['xMmx6VQP3r', 'c1c63d3e-1f22-42e9-a47a-682c9f109834'],
      'Frog.glb': ['9Z2V8fpazF', '08416495-b056-4ed7-b23b-5a10e82277a0'],
    },
  },
  // Khronos glTF sample: mesh CC0 (PixelMannen), rig + animations CC-BY 4.0 (@tomkranis).
  animals: {
    root: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox',
    license: 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/Fox/LICENSE.md',
    files: ['glTF-Binary/Fox.glb'],
  },
};

async function fetchBytes(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function download(pack, rel, outDir, seen) {
  const key = `${pack.root}/${rel}`;
  if (seen.has(key)) return;
  seen.add(key);
  // KayKit ships some binaries as "name.gltf.glb"; store them as "name.glb".
  const name = rel.split('/').pop().replace(/\.gltf\.glb$/, '.glb');
  const dest = join(outDir, name);
  let bytes;
  if (existsSync(dest)) {
    bytes = readFileSync(dest);
  } else {
    bytes = await fetchBytes(`${pack.root}/${rel}`);
    writeFileSync(dest, bytes);
    console.log(`  ${name} (${(bytes.length / 1024).toFixed(0)} KiB)`);
  }
  if (name.endsWith('.gltf')) {
    const doc = JSON.parse(Buffer.from(bytes).toString('utf8'));
    const deps = [...(doc.buffers ?? []), ...(doc.images ?? [])].map((b) => b.uri).filter((u) => u && !u.startsWith('data:'));
    for (const dep of deps) await download(pack, `${dirname(rel)}/${decodeURIComponent(dep)}`, outDir, seen);
  }
}

for (const [id, pack] of Object.entries(PACKS)) {
  const outDir = join(OUT, id);
  mkdirSync(outDir, { recursive: true });
  if (pack.direct) {
    console.log(`${id} ← poly.pizza (Quaternius, CC0)`);
    const lines = ['Quaternius — animated animals. License: CC0 1.0 (public domain).', 'https://quaternius.com — files from Poly Pizza:', ''];
    for (const [name, [page, uuid]] of Object.entries(pack.direct)) {
      const dest = join(outDir, name);
      if (!existsSync(dest)) {
        const bytes = await fetchBytes(`https://static.poly.pizza/${uuid}.glb`);
        writeFileSync(dest, bytes);
        console.log(`  ${name} (${(bytes.length / 1024).toFixed(0)} KiB)`);
      }
      lines.push(`${name}: https://poly.pizza/m/${page}`);
    }
    writeFileSync(join(outDir, 'LICENSE.txt'), `${lines.join('\n')}\n`);
    continue;
  }
  console.log(`${id} ← ${pack.root}`);
  const lic = join(outDir, 'LICENSE.txt');
  if (!existsSync(lic)) writeFileSync(lic, await fetchBytes(pack.license));
  const seen = new Set();
  for (const rel of pack.files) await download(pack, rel, outDir, seen);
}
console.log('done');
