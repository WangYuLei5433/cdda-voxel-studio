// Catalog objects for the model editor (from /api/editor/catalog, tools/editor/catalog.mjs)
// and how each one is shown in the game: its resolution status and search.
import type { Appearance, Describable } from '../render/appearance';
import { planMonster, type MonsterPlan } from '../render/creature-plan';
import type { EditKind } from './overrides';

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

export const EMPTY_CATALOG: EditorCatalog = { ter: [], furn: [], item: [], monster: [], vehicle: [], vpart: [], field: [], trap: [], labels: { itemCat: {}, vpartCat: {} } };

export const KIND_LABEL: Record<CatalogKind, string> = { ter: '地形', furn: '家具', item: '物品', monster: '生物', vehicle: '载具', vpart: '载具部件', field: '场地效果', trap: '陷阱' };

/** Kinds whose look the editor can change (the game resolves a model for them). */
export const isEditable = (kind: string): kind is EditKind => ['ter', 'furn', 'item', 'monster', 'vehicle'].includes(kind);

/** How an object is drawn, summarised for the list. */
export type Status = 'override' | 'fallback' | 'base' | 'texture' | 'procedural' | 'hidden' | 'none';

export const STATUS_LABEL: Record<Status, string> = {
  override: '本地覆盖',
  fallback: '材质回退',
  base: '基础模型',
  texture: '仅贴图',
  procedural: '程序生成',
  hidden: '游戏中不显示',
  none: '无模型',
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
