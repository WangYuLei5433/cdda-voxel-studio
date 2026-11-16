// Which voxel model a CDDA object gets from the loaded voxel sets, by cataclysm-3d's lookup
// order: the object's id, its looks_like chain, then its built-in model type (from
// public/data/cdda/<version>/builtin-kinds.json, tools/classify/builtin-kinds.mjs).
import type { LoadedSet, VoxItem } from './library';
import { VoxelSetIndex, voxId, type Resolution, type VoxKind } from './voxelset';

/** builtin-kinds.json: { kind: { id: { builtin, material? } } } plus where the rules came from. */
export interface BuiltinKinds {
  source?: { repo: string; commit: string; file: string };
  [kind: string]: unknown;
}

export interface VoxMatch extends Resolution {
  set: LoadedSet;
  item: VoxItem;
}

interface Described { id: string; looksLike?: string }

export class VoxMatcher {
  private readonly indexes: { set: LoadedSet; index: VoxelSetIndex }[];
  private readonly looks = new Map<string, Map<string, string>>();
  private readonly cache = new Map<string, VoxMatch | null>();

  constructor(
    sets: LoadedSet[],
    catalog: Partial<Record<VoxKind, Described[]>>,
    private readonly builtin: BuiltinKinds | null,
    private readonly items: Map<string, VoxItem>,
  ) {
    this.indexes = sets.map((set) => ({ set, index: new VoxelSetIndex(set.set) }));
    for (const [kind, entries] of Object.entries(catalog)) {
      // Only the object lists (a catalog also carries labels and meta).
      if (Array.isArray(entries)) this.looks.set(kind, new Map(entries.filter((e) => e.looksLike).map((e) => [e.id, e.looksLike!])));
    }
  }

  get active(): boolean {
    return this.indexes.length > 0;
  }

  /** The built-in type and material of an object, when the rules give one. */
  builtinOf(kind: VoxKind, id: string): { type: string; material?: string } | undefined {
    const row = (this.builtin?.[kind] as Record<string, { builtin: string; material?: string }> | undefined)?.[id];
    return row ? { type: row.builtin, ...(row.material ? { material: row.material } : {}) } : undefined;
  }

  /** The first set (in load order) with a model for the object; `variant` picks among its files. */
  find(kind: VoxKind, id: string, variant = 0): VoxMatch | null {
    const key = `${kind}:${id}:${variant}`;
    if (this.cache.has(key)) return this.cache.get(key)!;
    const looks = this.looks.get(kind);
    const builtin = this.builtinOf(kind, id);
    let found: VoxMatch | null = null;
    for (const { set, index } of this.indexes) {
      const r = index.resolve(kind, id, (x) => looks?.get(x), builtin);
      if (!r) continue;
      const files = r.entry.files?.length ? r.entry.files : r.entry.file ? [r.entry.file] : [];
      const file = files[Math.abs(variant) % Math.max(1, files.length)];
      const item = file ? this.items.get(`${set.id}:${file}`) : undefined;
      if (item) {
        found = { ...r, set, item };
        break;
      }
    }
    this.cache.set(key, found);
    return found;
  }
}

export { voxId };
