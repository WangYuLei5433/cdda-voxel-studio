// voxelset.json: a voxel tileset, the format of cataclysm-3d (doc/VOXEL_TILESETS.md there).
// A set is a folder with voxelset.json and .vox files. Every model entry binds CDDA ids (or a
// built-in model type) to files. The studio keeps fields it does not know, and the order of
// entries, when it writes the file back.

export interface VoxAnimation {
  files: string[];
  fps?: number;
}

export interface VoxEntry {
  id?: string | string[];
  builtin?: string;
  material?: string;
  file?: string;
  files?: string[];
  offset?: [number, number, number];
  scale?: number;
  rotates?: boolean;
  random_rotation?: boolean;
  tint?: boolean;
  emissive?: boolean;
  animations?: Partial<Record<'idle' | 'walk' | 'attack' | 'death', VoxAnimation>>;
  mesh_height?: number;
  mesh_scale?: number;
  [extra: string]: unknown;
}

export interface VoxelSet {
  name: string;
  voxels_per_tile: number;
  models: VoxEntry[];
  [extra: string]: unknown;
}

export function parseVoxelSet(text: string): VoxelSet {
  const doc = JSON.parse(text) as Partial<VoxelSet>;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('voxelset.json must be an object');
  if (doc.models !== undefined && !Array.isArray(doc.models)) throw new Error('"models" must be a list');
  return { ...doc, name: typeof doc.name === 'string' ? doc.name : 'voxel set', voxels_per_tile: Number(doc.voxels_per_tile) > 0 ? Number(doc.voxels_per_tile) : 8, models: doc.models ?? [] };
}

/** voxelset.json text: two-space indent, one entry per line in "models" (as the starter kit writes it). */
export const formatVoxelSet = (set: VoxelSet): string => formatModelSet(set);

/** A set document (voxelset.json, meshset.json): two-space indent, one entry per line in "models". */
export function formatModelSet(set: { models: object[] }): string {
  const { models, ...head } = set;
  const lines = Object.entries(head).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`);
  const entries = models.map((m) => `    ${JSON.stringify(m).replace(/":/g, '": ').replace(/,"/g, ', "').replace(/^\{/, '{ ').replace(/\}$/, ' }')}`);
  lines.push(`  "models": [${entries.length ? `\n${entries.join(',\n')}\n  ` : ''}]`);
  return `{\n${lines.join(',\n')}\n}\n`;
}

/** Catalog kinds and how cataclysm-3d spells their ids in a voxel set. */
export type VoxKind = 'ter' | 'furn' | 'item' | 'monster' | 'vehicle' | 'vpart' | 'field' | 'trap';
export const voxId = (kind: VoxKind, id: string): string => (kind === 'vpart' ? `vp_${id}` : id);

/** Every file an entry names (variants and animation frames). */
export function entryFiles(e: VoxEntry): string[] {
  const out = [...(e.file ? [e.file] : []), ...(e.files ?? [])];
  for (const a of Object.values(e.animations ?? {})) out.push(...(a?.files ?? []));
  return out;
}

/** The fields every model set entry (voxel or mesh) binds objects with. */
export interface BindEntry {
  id?: string | string[];
  builtin?: string;
  material?: string;
  file?: string;
  files?: string[];
}

export interface Resolution<E extends BindEntry = VoxEntry> {
  entry: E;
  /** How it was found: the object's own id, an id up its looks_like chain, or its built-in type. */
  via: 'id' | 'looks_like' | 'builtin';
  /** The id that matched (for looks_like) or the built-in type. */
  matched: string;
}

/** Lookup tables of a set (voxel or mesh): exact ids and built-in types (with and without material). */
export class VoxelSetIndex<E extends BindEntry = VoxEntry> {
  private readonly byId = new Map<string, E>();
  private readonly byBuiltin = new Map<string, E>();

  constructor(readonly set: { models: E[] }) {
    for (const e of set.models) {
      for (const id of [e.id ?? []].flat()) if (!this.byId.has(id)) this.byId.set(id, e);
      if (e.builtin) {
        const key = e.material ? `${e.builtin}:${e.material}` : e.builtin;
        if (!this.byBuiltin.has(key)) this.byBuiltin.set(key, e);
      }
    }
  }

  /**
   * cataclysm-3d's lookup order: the exact id, then the looks_like chain, then a built-in
   * override of the object's model type (with its material first), else null (the built-in
   * procedural model). `looksLike(id)` gives the next id up the chain.
   */
  resolve(kind: VoxKind, id: string, looksLike: (id: string) => string | undefined, builtin?: { type: string; material?: string }): Resolution<E> | null {
    const own = this.byId.get(voxId(kind, id));
    if (own) return { entry: own, via: 'id', matched: id };
    const seen = new Set([id]);
    for (let next = looksLike(id); next && !seen.has(next); next = looksLike(next)) {
      seen.add(next);
      const e = this.byId.get(voxId(kind, next));
      if (e) return { entry: e, via: 'looks_like', matched: next };
    }
    if (builtin) {
      const e = (builtin.material && this.byBuiltin.get(`${builtin.type}:${builtin.material}`)) || this.byBuiltin.get(builtin.type);
      if (e) return { entry: e, via: 'builtin', matched: builtin.type };
    }
    return null;
  }
}

/** Bind `file` to one object: replace its own entry's file, or add an entry. Returns a new set. */
export function bindFile(set: VoxelSet, kind: VoxKind, id: string, file: string): VoxelSet {
  const key = voxId(kind, id);
  const models = [...set.models];
  const at = models.findIndex((m) => m.id === key);
  if (at >= 0) {
    const next: VoxEntry = { ...models[at], file };
    delete next.files;
    models[at] = next;
  } else {
    models.push({ id: key, file });
  }
  return { ...set, models };
}

/** Problems a model file has against the cataclysm-3d conventions (empty when fine). */
export function checkModel(size: [number, number, number], voxels: Uint8Array, voxelsPerTile: number): string[] {
  const out: string[] = [];
  if (size.some((s) => s > 256)) out.push('size');
  let lowest = Infinity;
  for (let i = 2; i < voxels.length; i += 4) lowest = Math.min(lowest, voxels[i]);
  if (voxels.length && lowest > 0) out.push('floating');
  if ((size[0] - voxelsPerTile) % 2 !== 0 || (size[1] - voxelsPerTile) % 2 !== 0) out.push('odd-width');
  if (!voxels.length) out.push('empty');
  return out;
}
