// Which model a CDDA object gets from the loaded sets (voxel sets, and mesh sets the same way),
// by cataclysm-3d's lookup order: the object's id, its looks_like chain, then its built-in
// model type (from public/data/cdda/<version>/builtin-kinds.json, tools/classify/builtin-kinds.mjs).
import type { LoadedSet, VoxItem } from './library';
import { VoxelSetIndex, voxId, type BindEntry, type Resolution, type VoxEntry, type VoxKind } from './voxelset';

/** builtin-kinds.json: { kind: { id: { builtin, material? } } } plus where the rules came from. */
export interface BuiltinKinds {
  source?: { repo: string; commit: string; file: string };
  [kind: string]: unknown;
}

/** A set the matcher can search: its id (in item keys) and its entries. */
export interface MatchableSet<E extends BindEntry = BindEntry> {
  id: string;
  /** `match: "exact"`: the set binds exact ids only (no looks_like chain, no built-in types). */
  set: { models: E[]; match?: unknown };
}

export interface Match<S extends MatchableSet<E>, I, E extends BindEntry> extends Resolution<E> {
  set: S;
  item: I;
}

export type VoxMatch = Match<LoadedSet, VoxItem, VoxEntry>;

interface Described { id: string; looksLike?: string }

export class VoxMatcher<E extends BindEntry = VoxEntry, S extends MatchableSet<E> = LoadedSet & MatchableSet<E>, I = VoxItem> {
  private readonly indexes: { set: S; index: VoxelSetIndex<E> }[];
  private readonly looks = new Map<string, Map<string, string>>();
  private readonly cache = new Map<string, Match<S, I, E> | null>();

  constructor(
    sets: S[],
    catalog: Partial<Record<VoxKind, Described[]>>,
    private readonly builtin: BuiltinKinds | null,
    private readonly items: Map<string, I>,
    /** The library key of a set's file (voxel sets: "<set>:<file>"). */
    private readonly itemKey: (set: S, file: string) => string = (set, file) => `${set.id}:${file}`,
  ) {
    this.indexes = sets.map((set) => ({ set, index: new VoxelSetIndex<E>(set.set) }));
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
  find(kind: VoxKind, id: string, variant = 0): Match<S, I, E> | null {
    const key = `${kind}:${id}:${variant}`;
    if (!this.cache.has(key)) this.cache.set(key, this.matches(kind, id, variant, true)[0] ?? null);
    return this.cache.get(key)!;
  }

  /** Every set's model for the object, in load order (the first is `find`'s). */
  findAll(kind: VoxKind, id: string, variant = 0): Match<S, I, E>[] {
    return this.matches(kind, id, variant, false);
  }

  private matches(kind: VoxKind, id: string, variant: number, firstOnly: boolean): Match<S, I, E>[] {
    const looks = this.looks.get(kind);
    const builtin = this.builtinOf(kind, id);
    const out: Match<S, I, E>[] = [];
    for (const { set, index } of this.indexes) {
      const exact = set.set.match === 'exact';
      const r = exact ? index.resolve(kind, id, () => undefined) : index.resolve(kind, id, (x) => looks?.get(x), builtin);
      if (!r) continue;
      const files = r.entry.files?.length ? r.entry.files : r.entry.file ? [r.entry.file] : [];
      const file = files[Math.abs(variant) % Math.max(1, files.length)];
      const item = file ? this.items.get(this.itemKey(set, file)) : undefined;
      if (!item) continue;
      out.push({ ...r, set, item });
      if (firstOnly) break;
    }
    return out;
  }
}

export { voxId };
