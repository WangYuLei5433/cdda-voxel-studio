// Voxel sets the studio can show: every .vox file of every set, as a browsable library.
// The dev server lists the sets under vendor/voxel/ (GET /api/voxel/sets) and serves their
// files at /voxel/<set>/…; a static build has none until a set is opened.
import * as THREE from 'three';

import { readVox, type VoxModel } from './vox-format';
import { voxObject } from './vox-mesh';
import { checkModel, entryFiles, parseVoxelSet, type BindEntry, type VoxEntry, type VoxelSet } from './voxelset';

export interface LoadedSet {
  /** Folder name, used in ids. */
  id: string;
  /** Base URL of the set's files (ends with "/"). */
  base: string;
  set: VoxelSet;
}

/** One library item: a model file and the entries that use it. */
export interface VoxItem {
  /** "<set>:<file>". */
  key: string;
  set: LoadedSet;
  file: string;
  entries: VoxEntry[];
}

export async function loadVoxelSets(): Promise<LoadedSet[]> {
  try {
    const res = await fetch('/api/voxel/sets', { cache: 'no-store' });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return [];
    const ids = (await res.json()) as string[];
    const out: LoadedSet[] = [];
    for (const id of ids) {
      const base = `/voxel/${encodeURIComponent(id)}/`;
      const r = await fetch(`${base}voxelset.json`, { cache: 'no-store' });
      if (r.ok) out.push({ id, base, set: parseVoxelSet(await r.text()) });
    }
    return out;
  } catch {
    return [];
  }
}

/** Every model file of the sets, with the entries naming it (first use first). */
export function libraryItems(sets: LoadedSet[]): VoxItem[] {
  const items = new Map<string, VoxItem>();
  for (const s of sets) {
    for (const e of s.set.models) {
      for (const file of entryFiles(e)) {
        const key = `${s.id}:${file}`;
        const item = items.get(key) ?? { key, set: s, file, entries: [] };
        item.entries.push(e);
        items.set(key, item);
      }
    }
  }
  return [...items.values()];
}

let idName: (id: string) => string | undefined = () => undefined;
/** How entryLabel names a bound id (the editor sets it: the object's name from the CDDA catalog). */
export function setIdNamer(namer: (id: string) => string | undefined): void {
  idName = namer;
}

/** What an entry binds, in words: "builtin wall (brick)" / "mon_zombie (zombie), mon_zombie_fat (fat zombie)". */
export const entryLabel = (e: BindEntry): string =>
  e.builtin
    ? `builtin ${e.builtin}${e.material ? ` (${e.material})` : ''}`
    : [e.id ?? []].flat().map((id) => { const n = idName(id); return n && n !== id ? `${id} (${n})` : id; }).join(', ');

/** Built-in model types grouped for the library tree (cataclysm-3d doc/VOXEL_TILESETS.md). */
export const BUILTIN_GROUPS: [string, string[]][] = [
  ['terrain', ['floor', 'wall', 'window', 'door', 'door_open', 'stairs_down', 'stairs_up', 'hole', 'fence', 'rubble', 'ramp', 'water', 'pillar', 'mound']],
  ['nature', ['tree', 'pine', 'dead_tree', 'young_tree', 'shrub', 'flower', 'tall_grass', 'boulder', 'stump', 'hedge']],
  ['furniture', ['bed', 'table', 'chair', 'sofa', 'counter', 'cabinet', 'toilet', 'sink', 'bathtub', 'stove', 'screen', 'crate', 'barrel', 'dumpster', 'sign', 'lamp', 'furniture', 'machine', 'pole', 'stack', 'mat', 'panel', 'grave', 'anvil', 'trap']],
  ['creature', ['humanoid', 'zombie', 'quadruped', 'bird', 'bug', 'robot', 'blob', 'fish', 'plant_creature']],
  ['item', ['item_pile', 'item_gun', 'item_blade', 'item_tool', 'item_clothing', 'item_food', 'item_bottle', 'item_book', 'item_ammo', 'item_corpse', 'held']],
  ['vehicle', ['vehicle', 'veh_body', 'veh_frame', 'veh_part', 'veh_seat', 'veh_wheel', 'veh_window']],
  ['effect', ['fire', 'splat', 'cloud', 'rain', 'snow', 'bolt', 'particle', 'spark', 'cursor', 'marker', 'omt_block', 'omt_ground']],
];

export function builtinGroup(builtin: string | undefined): string {
  if (!builtin) return 'object';
  return BUILTIN_GROUPS.find(([, types]) => types.includes(builtin))?.[0] ?? 'other';
}

const cache = new Map<string, Promise<VoxModel>>();

/** The model file of an item (fetched once). */
export function fetchVox(item: VoxItem): Promise<VoxModel> {
  const url = item.set.base + item.file.split('/').map(encodeURIComponent).join('/');
  let p = cache.get(url);
  if (!p) {
    p = fetch(url).then(async (r) => {
      if (!r.ok) throw new Error(`${item.file}: ${r.status}`);
      return readVox(await r.arrayBuffer());
    });
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

/**
 * The mesh of an item as `entry` (default: its first entry) places it: offset in voxels,
 * scale, emissive; `tint` multiplies the colors (an entry with "tint": true, by the object's color).
 */
export async function buildVox(item: VoxItem, entry?: VoxEntry, tint?: number): Promise<{ object: THREE.Object3D; model: VoxModel; problems: string[] }> {
  const model = await fetchVox(item);
  const vpt = item.set.set.voxels_per_tile;
  const e = entry ?? item.entries[0] ?? {};
  const mesh = voxObject(model, vpt, { emissive: Boolean(e.emissive), ...(tint !== undefined ? { tint } : {}) });
  const root = new THREE.Group();
  root.add(mesh);
  if (Array.isArray(e.offset)) mesh.position.set(e.offset[0] / vpt, e.offset[1] / vpt, e.offset[2] / vpt);
  if (typeof e.scale === 'number' && e.scale > 0) root.scale.setScalar(e.scale);
  return { object: root, model, problems: checkModel(model.size, model.voxels, vpt) };
}
