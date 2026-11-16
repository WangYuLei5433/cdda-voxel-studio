// The model editor's local override document (public/data/appearance.local.json) and the
// edits it holds. One edit per catalog object: a rule `^id$` → model key, plus, when the
// placement changes (turn, lift, lie flat), a derived model entry "edit:<kind>:<id>" that
// copies the chosen model's entry with those changes. Other objects using the same model
// are never affected.
import type { AppearanceKind, AppearanceRule, ModelEntry } from '../render/appearance';

export type EditKind = Extract<AppearanceKind, 'ter' | 'furn' | 'item' | 'monster' | 'vehicle'>;

export interface OverrideDoc {
  models: Record<string, ModelEntry>;
  rules: AppearanceRule[];
}

export interface Edit {
  /** Model key from the registry. */
  model: string;
  /** Size factor on top of the model's own size. */
  scale: number;
  /** Turn about the vertical axis, degrees. */
  rotY: number;
  /** Lift above the ground, tiles. */
  y: number;
  lieFlat: boolean;
  /** Tint with the object's CDDA colour. */
  tint: boolean;
}

export const emptyDoc = (): OverrideDoc => ({ models: {}, rules: [] });

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const idPattern = (id: string) => `^${escape(id)}$`;
export const derivedKey = (kind: EditKind, id: string) => `edit:${kind}:${id}`;

const ruleIndex = (doc: OverrideDoc, kind: EditKind, id: string) => doc.rules.findIndex((r) => r.kind === kind && r.id === idPattern(id));

/** The saved edit for an object, or null. */
export function readEdit(doc: OverrideDoc, kind: EditKind, id: string): Edit | null {
  const rule = doc.rules[ruleIndex(doc, kind, id)];
  if (!rule || typeof rule.model !== 'string') return null;
  const derived = doc.models[rule.model];
  const placed = derived?.editOf ? derived : null;
  return {
    model: placed?.editOf ?? rule.model,
    scale: rule.scale ?? 1,
    rotY: Math.round((((placed?.rotY ?? 0) - (placed?.baseRotY ?? 0)) * 180) / Math.PI),
    y: (placed?.y ?? 0) - (placed?.baseY ?? 0),
    lieFlat: Boolean(placed?.lieFlat),
    tint: Boolean(rule.tint),
  };
}

/**
 * Store an edit. `base` is the chosen model's own registry entry (copied into the derived
 * entry when the placement changes).
 */
export function writeEdit(doc: OverrideDoc, kind: EditKind, id: string, edit: Edit, base: ModelEntry | undefined): OverrideDoc {
  const next = removeEdit(doc, kind, id);
  let model = edit.model;
  const placed = edit.rotY !== 0 || edit.y !== 0 || edit.lieFlat !== Boolean(base?.lieFlat);
  if (placed && base) {
    model = derivedKey(kind, id);
    next.models[model] = {
      ...base,
      editOf: edit.model,
      baseRotY: base.rotY ?? 0,
      baseY: base.y ?? 0,
      rotY: (base.rotY ?? 0) + (edit.rotY * Math.PI) / 180,
      y: (base.y ?? 0) + edit.y,
      lieFlat: edit.lieFlat,
      override: true,
    };
  }
  next.rules.push({ kind, id: idPattern(id), model, ...(edit.scale !== 1 ? { scale: edit.scale } : {}), ...(edit.tint ? { tint: true } : {}), override: true });
  return next;
}

/** Drop an object's edit (and its derived model entry). */
export function removeEdit(doc: OverrideDoc, kind: EditKind, id: string): OverrideDoc {
  const next: OverrideDoc = { models: { ...doc.models }, rules: [...doc.rules] };
  const at = ruleIndex(next, kind, id);
  if (at >= 0) next.rules.splice(at, 1);
  delete next.models[derivedKey(kind, id)];
  return next;
}

/** Objects with an edit, as "kind:id". */
export function editedObjects(doc: OverrideDoc): Set<string> {
  const out = new Set<string>();
  for (const r of doc.rules) {
    const m = /^\^(.*)\$$/.exec(r.id ?? '');
    if (m) out.add(`${r.kind}:${m[1].replace(/\\(.)/g, '$1')}`);
  }
  return out;
}
