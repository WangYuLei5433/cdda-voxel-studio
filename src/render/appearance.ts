// Appearance registry (docs/ARCHITECTURE.md §10), shared by the game and dev tools.
// public/data/appearance.json:
// {
//   "colors": { "t_grass": "#4f7d3a" },                  // tint overrides (any catalog id)
//   "models": { "<key>": { "url", "fit", "anim", ... } }, // model library; a key may also be
//                                                         // a CDDA id (exact match wins)
//   "rules":  [ { "kind": "furn", "id": "chair|stool", "model": "chair" }, ... ]
// }
// Every catalog entry resolves to a model through: exact id in "models" → first matching
// rule → none (the renderer's category geometry). Rules match on id regex, CDDA flags,
// monster species/bodytype/size, and item category — a few dozen cover thousands of ids.
// Model keys "procedural:<shape>" are generated in code (src/render/procedural.ts).
// "textures" names material textures; rules with "texture" (instead of "model") give
// terrain/furniture a surface texture, and a model's "detail" layers one over its colors.
// Overlays (the editor's local overrides) layer on top via merge(); later wins.
import type { TextureEntry } from './textures';

/** What the model editor saves (git-ignored); loaded last, so it wins over every pack. */
export const LOCAL_OVERRIDES = '/data/appearance.local.json';

/** Overlays loaded after the base document; missing files are skipped. */
export const LOCAL_PACKS = [LOCAL_OVERRIDES];

export interface ModelEntry {
  url: string;
  /** Explicit scale; ignored when `fit` is set. */
  scale?: number;
  /** Scale so the model's larger horizontal extent spans this many tiles. */
  fit?: number;
  y?: number;
  rotY?: number;
  rotX?: number;
  /** Lay the model down (rotate −90° about X): long items modelled standing up. */
  lieFlat?: boolean;
  rotZ?: number;
  attachments?: { model: string; offset: [number, number, number]; scale: number }[];
  damaged?: Partial<Record<'front' | 'rear' | 'left' | 'right', string>>;
  /** Node-name substrings to hide (e.g. weapons baked into character packs). */
  hide?: string[];
  /** Texture key layered over the model's colors (wood grain, bark, rock…). */
  detail?: string;
  /** Color texture URL applied to every mesh (packs whose glTF files carry no images). */
  texture?: string;
  /** Saved by the model editor: an exact-id entry that wins in every style. */
  override?: boolean;
  /** Model-editor placement edits: the model key this entry copies, and that model's own rotY / y. */
  editOf?: string;
  baseRotY?: number;
  baseY?: number;
  /** Load on first use instead of at startup (large packs). */
  lazy?: boolean;
  /** Material-only fallback on generic geometry, reported separately from a matched model. */
  fallback?: boolean;
  /** Fixed facing for models baked in a known orientation. */
  facing?: string;
  /** A fragment's position in a multi-tile object. */
  tile?: { x: number; z: number; width: number; depth: number; complete?: string };
  preserveOrigin?: boolean;
  /** Seasonal model keys in spring/summer/autumn/winter order. */
  seasons?: string[];
  /** clip names in the glTF for each animation role */
  anim?: Partial<Record<'idle' | 'walk' | 'attack' | 'hit' | 'die' | 'interact' | 'pickup', string>>;
}

export type AppearanceKind = 'ter' | 'furn' | 'item' | 'monster' | 'vpart' | 'vehicle' | 'character' | 'field';

export interface AppearanceRule {
  kind: AppearanceKind;
  /** Regex tested against the CDDA id. */
  id?: string;
  /** Every listed flag must be present. */
  flags?: string[];
  /** At least one listed flag must be present. */
  anyFlag?: string[];
  species?: string;
  /** Monster bodytype(s). */
  body?: string[];
  /** Item category id(s). */
  cat?: string[];
  minSize?: number;
  /** Model key, or several (picked per object for variety). */
  model?: string | string[];
  /** Surface texture key (rules without a model only set the texture). */
  texture?: string | string[];
  /** Tint the model with the entry's CDDA color (e.g. one animal model for many animals). */
  tint?: boolean;
  /** Extra scale factor on top of the model's fit. */
  scale?: number;
  /** Saved by the model editor: tried before exact-id entries and every other rule. */
  override?: boolean;
}

export interface AppearanceDoc {
  colors?: Record<string, string>;
  textures?: Record<string, TextureEntry>;
  models?: Record<string, ModelEntry>;
  rules?: AppearanceRule[];
}

/** What a catalog entry looks like to the rule matcher. */
export interface Describable {
  id: string;
  flags?: string[];
  species?: string[];
  body?: string;
  size?: number;
  cat?: string;
}

export interface Resolved {
  /** Model key (into models), or "procedural:<shape>". */
  model: string;
  tint: boolean;
  scale: number;
}

/** How a catalog entry got its model (the model editor shows this). */
export interface Explanation {
  via: 'override' | 'exact' | 'rule' | 'none';
  resolved: Resolved | null;
  /** The matching rule and its position in match order (0 = tried first). */
  rule?: AppearanceRule;
  ruleIndex?: number;
  /** Surface texture key and the rule that gave it. */
  texture: string | null;
  textureRule?: AppearanceRule;
}

export class Appearance {
  private colors = new Map<string, number>();
  private models = new Map<string, ModelEntry>();
  private rules: (AppearanceRule & { re?: RegExp })[] = [];
  private cache = new Map<string, Resolved | null>();
  private textureCache = new Map<string, string | null>();
  readonly textures: Record<string, TextureEntry> = {};

  static async load(url = '/data/appearance.json', packs: string[] = LOCAL_PACKS): Promise<Appearance> {
    const a = new Appearance();
    for (const u of [url, ...packs]) {
      try {
        const res = await fetch(u);
        // A missing pack comes back as the SPA's index.html: only JSON counts.
        if (res.ok && res.headers.get('content-type')?.includes('json')) a.merge((await res.json()) as AppearanceDoc);
      } catch {
        // Optional file: defaults apply.
      }
    }
    return a;
  }

  merge(doc: AppearanceDoc, baseUrl = ''): void {
    for (const [id, hex] of Object.entries(doc.colors ?? {})) {
      const n = Number.parseInt(hex.replace('#', ''), 16);
      if (Number.isFinite(n)) this.colors.set(id, n);
    }
    for (const [id, entry] of Object.entries(doc.textures ?? {})) {
      this.textures[id] = { ...entry, url: baseUrl && !/^(https?:|\/|blob:)/.test(entry.url) ? `${baseUrl}/${entry.url}` : entry.url };
    }
    for (const [id, entry] of Object.entries(doc.models ?? {})) {
      this.models.set(id, { ...entry, url: baseUrl && !/^(https?:|\/|blob:)/.test(entry.url) ? `${baseUrl}/${entry.url}` : entry.url });
    }
    // Later documents take precedence: their rules are tried first.
    this.rules = [...(doc.rules ?? []).map((r) => ({ ...r, re: r.id ? new RegExp(r.id) : undefined })), ...this.rules];
    this.cache.clear();
    this.textureCache.clear();
  }

  colorFor(id: string): number | undefined {
    return this.colors.get(id);
  }

  /** Model entry by key (a model-library key or an exact CDDA id). */
  model(key: string): ModelEntry | undefined {
    return this.models.get(key);
  }

  /** Back-compat lookup: exact id, else "kind:<kind>". */
  modelFor(id: string, kind?: string): ModelEntry | undefined {
    return this.models.get(id) ?? (kind ? this.models.get(`kind:${kind}`) : undefined);
  }

  /** Resolve a catalog entry to a model through exact ids and rules (cached per kind+id). */
  resolve(kind: AppearanceKind, d: Describable, variantSeed = 0, facing?: string, season = 0, cell?: { x: number; z: number; width: number; depth: number }): Resolved | null {
    const key = `${kind}:${d.id}`;
    let r = this.cache.get(key);
    if (r === undefined) {
      r = this.pick(kind, d).resolved;
      this.cache.set(key, r);
    }
    if (r && r.model.includes('|')) {
      let all = r.model.split('|');
      if (cell && (cell.width > 1 || cell.depth > 1)) {
        const fitting = all.filter((key) => {
          const t = this.models.get(key)?.tile;
          return t && (cell.width >= cell.depth ? t.width >= t.depth : t.depth >= t.width);
        });
        if (fitting.length) all = fitting;
      }
      const directed = facing ? all.filter((key) => this.models.get(key)?.facing === facing) : [];
      let options = directed.length ? directed : all;
      if (cell) {
        const matching = options.filter((key) => {
          const t = this.models.get(key)?.tile;
          return t && t.x === cell.x % t.width && t.z === cell.z % t.depth;
        });
        if (matching.length) options = matching;
      }
      r = { ...r, model: options[Math.abs(variantSeed) % options.length] };
    }
    if (r && cell?.width === 1 && cell.depth === 1) {
      const complete = this.models.get(r.model)?.tile?.complete;
      if (complete) r = { ...r, model: complete };
    }
    const seasons = r && this.models.get(r.model)?.seasons;
    return r && seasons?.length ? { ...r, model: seasons[Math.max(0, Math.min(seasons.length - 1, season))] } : r;
  }

  /** Surface texture key for a catalog entry (first matching texture rule), or null. */
  textureFor(kind: AppearanceKind, d: Describable, variantSeed = 0): string | null {
    const key = `${kind}:${d.id}`;
    let r = this.textureCache.get(key);
    if (r === undefined) {
      r = null;
      for (const rule of this.rules) {
        if (rule.texture && this.matches(rule, kind, d)) {
          r = Array.isArray(rule.texture) ? rule.texture.join('|') : rule.texture;
          break;
        }
      }
      this.textureCache.set(key, r);
    }
    if (r?.includes('|')) { const options = r.split('|'); return options[Math.abs(Math.round(variantSeed)) % options.length]; }
    return r;
  }

  private matches(rule: AppearanceRule & { re?: RegExp }, kind: AppearanceKind, d: Describable): boolean {
    if (rule.kind !== kind) return false;
    if (rule.re && !rule.re.test(d.id)) return false;
    if (rule.flags && !rule.flags.every((f) => d.flags?.includes(f))) return false;
    if (rule.anyFlag && !rule.anyFlag.some((f) => d.flags?.includes(f))) return false;
    if (rule.species && !d.species?.includes(rule.species)) return false;
    if (rule.body && !(d.body && rule.body.includes(d.body))) return false;
    if (rule.cat && !(d.cat && rule.cat.includes(d.cat))) return false;
    if (rule.minSize !== undefined && (d.size ?? 0) < rule.minSize) return false;
    return true;
  }

  private exactUsable(entry: ModelEntry | undefined): boolean {
    return Boolean(entry);
  }

  /** Editor overrides → exact id → first matching rule. */
  private pick(kind: AppearanceKind, d: Describable): Omit<Explanation, 'texture' | 'textureRule'> {
    const ruled = (rule: AppearanceRule, ruleIndex: number) => ({
      resolved: { model: Array.isArray(rule.model) ? rule.model.join('|') : rule.model!, tint: Boolean(rule.tint), scale: rule.scale ?? 1 },
      rule: stripRe(rule),
      ruleIndex,
    });
    const overrideAt = this.rules.findIndex((rule) => rule.override && rule.model && this.matches(rule, kind, d));
    if (overrideAt >= 0) return { via: 'override', ...ruled(this.rules[overrideAt], overrideAt) };
    const exact = this.models.get(d.id);
    if (exact && this.exactUsable(exact)) return { via: exact.override ? 'override' : 'exact', resolved: { model: d.id, tint: false, scale: 1 } };
    const at = this.rules.findIndex((rule) => rule.model && this.matches(rule, kind, d));
    if (at >= 0) return { via: 'rule', ...ruled(this.rules[at], at) };
    return { via: 'none', resolved: null };
  }

  /** Which entry or rule gives a catalog entry its model and texture (uncached, for tools). */
  explain(kind: AppearanceKind, d: Describable): Explanation {
    const textureAt = this.rules.findIndex((rule) => rule.texture && this.matches(rule, kind, d));
    const textureRule = textureAt >= 0 ? this.rules[textureAt] : undefined;
    return {
      ...this.pick(kind, d),
      texture: textureRule ? (Array.isArray(textureRule.texture) ? textureRule.texture.join('|') : textureRule.texture!) : null,
      textureRule: textureRule && stripRe(textureRule),
    };
  }

  /** Every model key in the registry. */
  modelKeys(): string[] {
    return [...this.models.keys()];
  }

  get modelCount(): number {
    return this.models.size;
  }

  allModels(): ModelEntry[] {
    return [...this.models.values()];
  }
}

function stripRe(rule: AppearanceRule & { re?: RegExp }): AppearanceRule {
  const plain = { ...rule };
  delete plain.re;
  return plain;
}
