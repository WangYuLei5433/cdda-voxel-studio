// Catalog objects for the model editor (from /api/editor/catalog, tools/editor/catalog.mjs)
// and how each one is shown in the game: its resolution status and search.
import type { Appearance, Describable } from '../render/appearance';
import { planMonster, type MonsterPlan } from '../render/creature-plan';
import type { EditKind } from './overrides';
import { t } from './i18n';

export interface CatalogEntry extends Describable {
  /** Display name (Chinese when translated). */
  name: string;
  en: string;
  sym: string;
  color: string;
  flags: string[];
  move?: number;
  looksLike?: string;
  /** Items: item category; armour coverage. */
  cat?: string;
  covers?: string[];
  /** Monsters. */
  species?: string[];
  body?: string;
  size?: number;
  /** Vehicles: length and width in tiles (from the part layout). */
  length?: number;
  width?: number;
  /** Vehicle parts: mount location (cat is the part category). */
  location?: string;
  /** Fields: solid / liquid / gas. */
  phase?: string;
  /** Traps: never visible (script triggers). */
  hidden?: boolean;
  /** Voxel models: the set's folder and name. */
  voxSet?: string;
  voxSetName?: string;
  /** The display name is the studio's own translation (the official one has none). */
  unofficialName?: boolean;
  /** Translation context of the name, when it has one. */
  ctxt?: string;
  /** Source file under data/json. */
  file?: string;
  /** Items: JSON type and subtypes (GUN, ARMOR, TOOL…). */
  types?: string[];
  /** Items and monsters: volume in ml, weight in g. */
  volume?: number;
  weight?: number;
  /** Items: longest side in mm; `longestSideDefault` when CDDA derives it from the volume. */
  longestSide?: number;
  longestSideDefault?: boolean;
  /** Items: named variants (the same item id in other looks). */
  variants?: { id: string; name: string; en: string }[];
  /** Furniture: strength needed to drag it. */
  requiredStr?: number;
  /** Vehicle parts: the item the part is made from. */
  item?: string;
}

/** Every object kind in the catalog: the editable ones plus vehicle parts, fields and traps. */
export type CatalogKind = EditKind | 'vpart' | 'field' | 'trap';

export interface CatalogLabels {
  /** Item category id → name. */
  itemCat: Record<string, string>;
  /** Vehicle-part category id → name. */
  vpartCat: Record<string, string>;
}

export type EditorCatalog = Record<CatalogKind, CatalogEntry[]> & { labels: CatalogLabels };

/** public/data/cdda/index.json: the generated catalogs, newest first. */
export interface CatalogIndex {
  versions: {
    id: string; path: string; cdda: string; commit?: string; translations?: string; generated: string; counts: Record<string, number>;
    /** Name files per CDDA language (zh_CN, ru…). */
    langs?: Record<string, { path: string; translated: number; generated: number; total: number }>;
  }[];
}

/** names.<lang>.json: translated names by kind and id; `generated` lists the studio-made ones. */
export interface CatalogNames {
  lang: string;
  kinds: Record<string, Record<string, string>>;
  variant: Record<string, string>;
  labels: Record<string, Record<string, string>>;
  generated: Record<string, string[]>;
}

/**
 * Give every entry its display name in one language (`names`, or English when null): the
 * translation when there is one, else the English name. Studio-made names are flagged.
 */
export function applyNames(catalog: EditorCatalog, names: CatalogNames | null): void {
  for (const kind of Object.keys(EMPTY_CATALOG).filter((k) => k !== 'labels') as CatalogKind[]) {
    const table = names?.kinds[kind] ?? {};
    const made = new Set(names?.generated[kind] ?? []);
    for (const e of catalog[kind]) {
      e.name = table[e.id] ?? e.en;
      if (made.has(e.id)) e.unofficialName = true;
      for (const v of e.variants ?? []) v.name = names?.variant[v.id] ?? v.en;
    }
  }
  for (const group of ['itemCat', 'vpartCat'] as const) {
    const table = names?.labels[group] ?? {};
    for (const id of Object.keys(catalog.labels[group])) catalog.labels[group][id] = table[id] ?? catalog.labels[group][id];
  }
}

export const EMPTY_CATALOG: EditorCatalog = { ter: [], furn: [], item: [], monster: [], vehicle: [], vpart: [], field: [], trap: [], labels: { itemCat: {}, vpartCat: {} } };

export const KIND_LABEL: Record<CatalogKind, string> = { ter: t('地形'), furn: t('家具'), item: t('物品'), monster: t('生物'), vehicle: t('载具'), vpart: t('载具部件'), field: t('场地效果'), trap: t('陷阱') };

/** Kinds whose look the editor can change (the game resolves a model for them). */
export const isEditable = (kind: string): kind is EditKind => ['ter', 'furn', 'item', 'monster', 'vehicle'].includes(kind);

/** How an object is drawn, summarised for the list. */
export type Status = 'voxel' | 'override' | 'fallback' | 'base' | 'texture' | 'procedural' | 'hidden' | 'none';

export const STATUS_LABEL: Record<Status, string> = {
  voxel: t('体素模型'),
  override: t('本地覆盖'),
  fallback: t('材质回退'),
  base: t('基础模型'),
  texture: t('仅贴图'),
  procedural: t('程序生成'),
  hidden: t('游戏中不显示'),
  none: t('无模型'),
};

/** The status of one object, by the same resolution the game uses. */
export function statusOf(kind: CatalogKind, entry: CatalogEntry, appearance: Appearance, plan?: MonsterPlan): Status {
  // Drawn by the map layer without a model lookup (src/render/map-layer.ts).
  if (kind === 'vpart') return 'procedural';
  if (kind === 'trap') return 'hidden';
  if (kind === 'field') {
    const t = appearance.textureFor('field', entry);
    return t ? 'texture' : 'procedural';
  }
  const why = appearance.explain(kind, entry);
  if (why.via === 'override') return 'override';
  if (kind === 'monster') {
    const p = plan ?? planMonster(monsterInfo(entry), 0, appearance);
    if (p.kind === 'placeholder') return 'none';
  }
  const key = why.resolved?.model.split('|')[0];
  if (key) {
    if (appearance.model(key)?.fallback) return 'fallback';
    return 'base';
  }
  return why.texture ? 'texture' : 'none';
}

/** A catalog monster as the creature plan wants it. */
export function monsterInfo(entry: CatalogEntry) {
  return { ...entry, species: [entry.species ?? []].flat(), body: String(entry.body ?? ''), size: entry.size ?? 3 };
}

/** Search: every word must appear in the id, the name or the English name. */
export function matches(entry: CatalogEntry, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${entry.id} ${entry.name} ${entry.en}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

/** Best matches first: exact id, id prefix, then the rest in id order. */
export function search(entries: CatalogEntry[], query: string): CatalogEntry[] {
  const q = query.trim().toLowerCase();
  const found = entries.filter((e) => matches(e, q));
  if (!q) return found;
  const rank = (e: CatalogEntry) => (e.id.toLowerCase() === q || e.name === q ? 0 : e.id.toLowerCase().startsWith(q) || e.name.startsWith(q) ? 1 : 2);
  return found.sort((a, b) => rank(a) - rank(b));
}
