// The studio's object catalog, read from the CDDA data files (no engine needed): terrain,
// furniture, items, monsters, vehicles, vehicle parts, fields and traps with their English
// names (and gettext contexts), and per-language name files built from CDDA's official
// translations (.po), filled in where they have none by tools/editor/names/<lang>.json.
// Run directly to print counts, or --write to generate public/data/cdda/<version>/.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

/** gettext .mo file → Map of msgid (with "ctxt\u0004" prefix when present) → first translation. */
export function readMo(path) {
  const map = new Map();
  if (!existsSync(path)) return map;
  const buf = readFileSync(path);
  const magic = buf.readUInt32LE(0);
  const read = magic === 0x950412de ? (o) => buf.readUInt32LE(o) : (o) => buf.readUInt32BE(o);
  const n = read(8);
  const orig = read(12);
  const trans = read(16);
  for (let i = 0; i < n; i++) {
    const ol = read(orig + i * 8);
    const oo = read(orig + i * 8 + 4);
    const tl = read(trans + i * 8);
    const to = read(trans + i * 8 + 4);
    const key = buf.toString('utf8', oo, oo + ol).split('\0')[0];
    const value = buf.toString('utf8', to, to + tl).split('\0')[0];
    if (key && value) map.set(key, value);
  }
  return map;
}

/** gettext .po file → Map of msgid (with "ctxt\u0004" prefix when present) → first translation. */
export function readPo(path) {
  const map = new Map();
  if (!existsSync(path)) return map;
  const unquote = (line) => JSON.parse(line.slice(line.indexOf('"')));
  let entry = {};
  let field = null;
  const flush = () => {
    const value = entry.msgstr ?? entry['msgstr[0]'];
    if (entry.msgid && value) map.set(entry.msgctxt !== undefined ? `${entry.msgctxt}\u0004${entry.msgid}` : entry.msgid, value);
    entry = {};
    field = null;
  };
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line.startsWith('#')) continue;
    if (!line.trim()) { flush(); continue; }
    const m = /^(msgctxt|msgid_plural|msgid|msgstr(?:\[\d+\])?)\s/.exec(line);
    if (m) {
      if (m[1] === 'msgctxt' || (m[1] === 'msgid' && (entry.msgstr !== undefined || entry['msgstr[0]'] !== undefined))) flush();
      field = m[1];
      entry[field] = unquote(line);
    } else if (field && line.startsWith('"')) {
      entry[field] += unquote(line);
    }
  }
  flush();
  return map;
}

/** English name of a CDDA "name" member, its gettext key, and its context. */
function nameOf(n) {
  if (!n) return null;
  if (typeof n === 'string') return { en: n, key: n };
  const en = n.str ?? n.str_sp;
  if (!en) return null;
  return { en, key: n.ctxt ? `${n.ctxt}\u0004${en}` : en, ...(n.ctxt ? { ctxt: n.ctxt } : {}) };
}

/** Every JSON `type` that defines an item (the modern "ITEM" plus the legacy per-kind types). */
const ITEM_TYPES = new Set([
  'GENERIC', 'ITEM', 'TOOL', 'ARMOR', 'TOOL_ARMOR', 'PET_ARMOR', 'COMESTIBLE', 'GUN', 'GUNMOD', 'AMMO', 'MAGAZINE',
  'BOOK', 'CONTAINER', 'BIONIC_ITEM', 'ENGINE', 'WHEEL', 'BATTERY', 'TOOLMOD',
]);

// ── Units (src/units.h): volumes in millilitres, masses in grams, lengths in millimetres ──
const UNIT_SCALE = {
  volume: { ml: 1, l: 1000 },
  mass: { mg: 0.001, g: 1, kg: 1000 },
  length: { mm: 1, cm: 10, m: 1000, km: 1_000_000 },
};
/** Unit-carrying fields, by the quantity they hold. Bare numbers are ml / g / mm. */
const UNIT_FIELDS = { volume: 'volume', weight: 'mass', longest_side: 'length', integral_volume: 'volume', integral_weight: 'mass', integral_longest_side: 'length' };

/** "1 L 250 ml" / "62.5 L" / 250 → number in the base unit; null when unreadable. */
export function parseUnits(v, quantity) {
  if (typeof v === 'number') return v;
  if (typeof v !== 'string') return null;
  const scale = UNIT_SCALE[quantity];
  let total = 0;
  let found = false;
  for (const m of v.matchAll(/(-?[\d.]+)\s*([a-zA-Z]+)/g)) {
    const f = scale[m[2].toLowerCase()];
    if (f === undefined) return null;
    total += Number(m[1]) * f;
    found = true;
  }
  return found ? total : null;
}

/** Unit fields of one raw object as numbers (other fields untouched). */
function normalizeUnits(o) {
  const out = { ...o };
  for (const [field, q] of Object.entries(UNIT_FIELDS)) {
    if (out[field] !== undefined) {
      const n = parseUnits(out[field], q);
      if (n === null) delete out[field];
      else out[field] = n;
    }
  }
  return out;
}

/** CDDA's volume_to_size (src/monstergenerator.cpp): 1 tiny … 5 huge. */
function sizeClass(ml) {
  if (ml === null || ml === undefined) return 3;
  if (ml <= 7500) return 1;
  if (ml <= 46250) return 2;
  if (ml <= 108000) return 3;
  if (ml <= 483750) return 4;
  return 5;
}

/** item_category_of (native/bridge/catalog.cpp) from JSON fields. */
function itemCategory(o, types) {
  if (o.category) return o.category;
  if (types.has('GUN')) return 'guns';
  if (types.has('MAGAZINE')) return 'magazines';
  if (types.has('AMMO')) return 'ammo';
  if (types.has('COMESTIBLE')) return o.comestible_type === 'MED' ? 'drugs' : 'food';
  if (types.has('BOOK')) return 'books';
  if (types.has('ARMOR') || types.has('TOOL_ARMOR')) return 'clothing';
  if (types.has('BIONIC_ITEM')) return 'bionics';
  if (o.seed_data) return 'seeds';
  if (types.has('TOOL')) return 'tools';
  return 'other';
}

/**
 * copy-from (doc/JSON/JSON_INHERITANCE.md): the child's own fields replace the parent's;
 * "relative" adds to and "proportional" scales the parent's numbers (unit strings included,
 * objects field by field); "extend" appends to and "delete" removes from the parent's lists.
 * Instruction keys, ids and "abstract" are never inherited.
 */
export function inherit(parent, child) {
  const out = { ...parent };
  for (const k of ['id', 'abstract', 'copy-from']) delete out[k];
  for (const [k, v] of Object.entries(child)) {
    if (!['relative', 'proportional', 'extend', 'delete'].includes(k)) out[k] = v;
  }
  const combine = (base, change, op) => {
    if (typeof change === 'number' && typeof base === 'number') return op === 'relative' ? base + change : base * change;
    if (change && typeof change === 'object' && !Array.isArray(change) && base && typeof base === 'object' && !Array.isArray(base)) {
      const r = { ...base };
      for (const [k, v] of Object.entries(change)) if (k in base) r[k] = combine(base[k], v, op);
      return r;
    }
    return base;
  };
  for (const op of ['relative', 'proportional']) {
    for (const [k, v] of Object.entries(child[op] ?? {})) {
      if (child[k] !== undefined || out[k] === undefined) continue;
      const change = op === 'relative' && UNIT_FIELDS[k] ? parseUnits(v, UNIT_FIELDS[k]) : v;
      out[k] = combine(out[k], change, op);
    }
  }
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const [k, v] of Object.entries(child.extend ?? {})) {
    const add = Array.isArray(v) ? v : [v];
    out[k] = [...(Array.isArray(out[k]) ? out[k] : out[k] === undefined ? [] : [out[k]]), ...add];
  }
  for (const [k, v] of Object.entries(child.delete ?? {})) {
    if (!Array.isArray(out[k])) continue;
    const drop = Array.isArray(v) ? v : [v];
    out[k] = out[k].filter((x) => !drop.some((d) => same(d, x)));
  }
  return out;
}

/**
 * Build the catalog. `jsonRoot`: a CDDA data/json folder. `translations`: a .po / .mo path or a
 * Map from readPo (optional); without it every `name` is the English one.
 * Each entry: { id, name, en, sym, color, flags, … } with kind-specific fields.
 */
export function buildCatalog(jsonRoot, translations) {
  const zh = translations instanceof Map ? translations : typeof translations === 'string' ? (translations.endsWith('.po') ? readPo : readMo)(translations) : new Map();
  // Per JSON type family: concrete objects by id, abstracts by name (for copy-from).
  const FAMILY = { terrain: 'ter', furniture: 'furn', MONSTER: 'monster', vehicle: 'vehicle', vehicle_part: 'vpart', field_type: 'field', trap: 'trap', ITEM_CATEGORY: 'itemCat', vehicle_part_category: 'vpartCat' };
  const names = Object.values(FAMILY).concat('item');
  const families = Object.fromEntries(names.map((n) => [n, new Map()]));
  const abstracts = Object.fromEntries(names.map((n) => [n, new Map()]));
  const fileOf = new Map();
  const familyOf = (type) => FAMILY[type] ?? (ITEM_TYPES.has(type) ? 'item' : null);
  for (const file of walk(jsonRoot)) {
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const rel = relative(jsonRoot, file);
    for (const o of Array.isArray(data) ? data : [data]) {
      if (!o || typeof o !== 'object') continue;
      const fam = familyOf(o.type);
      if (!fam) continue;
      if (o.abstract) abstracts[fam].set(o.abstract, o);
      for (const id of Array.isArray(o.id) ? o.id : o.id ? [o.id] : []) {
        families[fam].set(id, o);
        fileOf.set(o, rel);
      }
    }
  }
  const resolved = new Map();
  const resolve = (fam, o, depth = 0) => {
    let r = resolved.get(o);
    if (r) return r;
    const from = o['copy-from'];
    const base = from && depth < 32 ? families[fam].get(from) ?? abstracts[fam].get(from) : null;
    r = base && base !== o ? inherit(resolve(fam, base, depth + 1), normalizeUnits(o)) : normalizeUnits(o);
    resolved.set(o, r);
    return r;
  };
  const translate = (n) => n && (zh.get(n.key) ?? zh.get(n.en));
  const named = (o, id, fallback) => {
    const n = nameOf(o.name) ?? fallback;
    const en = n?.en ?? id;
    return { en, name: translate(n) ?? en, ...(n?.ctxt ? { ctxt: n.ctxt } : {}) };
  };
  // Seasonal symbols / colours come as lists; take the first. Always strings.
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const sym = (o) => { const v = first(o.symbol); return typeof v === 'string' && v ? v : '?'; };
  const color = (o) => { const v = first(o.color) ?? first(o.bgcolor); return typeof v === 'string' ? v : 'light_gray'; };
  const flagsOf = (o) => [...new Set((o.flags ?? []).filter((f) => typeof f === 'string'))];
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 1000) / 1000 : undefined);

  const feature = (fam) => [...families[fam]].map(([id, raw]) => {
    const o = resolve(fam, raw);
    return {
      id, ...named(o, id), sym: sym(o), color: color(o), move: o.move_cost ?? (fam === 'furn' ? o.move_cost_mod ?? 0 : 2), looksLike: o.looks_like ?? '', flags: flagsOf(o), file: fileOf.get(raw),
      ...(fam === 'furn' && num(o.required_str) !== undefined ? { requiredStr: num(o.required_str) } : {}),
    };
  });

  const items = [...families.item].map(([id, raw]) => {
    const o = resolve('item', raw);
    const types = new Set([o.type, ...(o.subtypes ?? [])]);
    const covers = new Set();
    for (const a of o.armor ?? []) for (const c of a.covers ?? []) covers.add(c);
    const volume = num(o.volume);
    // item_factory.cpp: an unset longest side is the cube root of the (per-charge) volume, in cm.
    const stack = types.has('AMMO') && o.stack_size > 0 ? o.stack_size : 1;
    const longest = num(o.longest_side) ?? (volume !== undefined ? Math.round(Math.cbrt(volume / stack)) * 10 : undefined);
    const variants = (o.variants ?? []).filter((v) => v && v.id).map((v) => ({ id: v.id, ...named(v, v.id, nameOf(o.name)) }));
    return {
      id, ...named(o, id), sym: sym(o), color: color(o), cat: itemCategory(o, types), types: [...types].filter((t) => t !== 'ITEM'), flags: flagsOf(o), covers: [...covers], looksLike: o.looks_like ?? '', file: fileOf.get(raw),
      ...(volume !== undefined ? { volume } : {}), ...(num(o.weight) !== undefined ? { weight: num(o.weight) } : {}),
      ...(longest !== undefined ? { longestSide: longest, ...(o.longest_side === undefined ? { longestSideDefault: true } : {}) } : {}),
      ...(variants.length ? { variants } : {}),
    };
  });

  const monsters = [...families.monster].map(([id, raw]) => {
    const o = resolve('monster', raw);
    const volume = num(o.volume);
    return {
      id, ...named(o, id), sym: sym(o), color: color(o), flags: flagsOf(o),
      size: sizeClass(volume), body: o.bodytype ?? '', species: [o.species ?? []].flat(), looksLike: o.looks_like ?? '', file: fileOf.get(raw),
      ...(volume !== undefined ? { volume } : {}), ...(num(o.weight) !== undefined ? { weight: num(o.weight) } : {}),
    };
  });

  const vehicles = [...families.vehicle].map(([id, raw]) => {
    const o = resolve('vehicle', raw);
    const xs = (o.parts ?? []).map((p) => p.x).filter((x) => typeof x === 'number');
    const ys = (o.parts ?? []).map((p) => p.y).filter((y) => typeof y === 'number');
    const span = (v) => (v.length ? Math.max(...v) - Math.min(...v) + 1 : 1);
    return { id, ...named(o, id), sym: '#', color: 'light_gray', flags: [], length: span(xs), width: span(ys), file: fileOf.get(raw) };
  });

  // Vehicle parts: named after their item when they have no name of their own.
  const vparts = [...families.vpart].map(([id, raw]) => {
    const o = resolve('vpart', raw);
    const item = o.item && families.item.get(o.item);
    const v = o.variants?.[0];
    const s = typeof v?.symbols === 'string' ? v.symbols[0] : sym(o);
    return { id, ...named(o, id, item ? nameOf(resolve('item', item).name) : null), sym: s || '?', color: color(o), flags: flagsOf(o), cat: (o.categories ?? [])[0] ?? 'other', location: o.location ?? '', ...(o.item ? { item: o.item } : {}), file: fileOf.get(raw) };
  });

  // Fields: named and coloured after their first intensity level.
  const fields = [...families.field].map(([id, raw]) => {
    const o = resolve('field', raw);
    const level = o.intensity_levels?.[0] ?? {};
    return { id, ...named(level, id), sym: typeof level.sym === 'string' && level.sym ? level.sym : '~', color: typeof level.color === 'string' ? level.color : 'white', flags: [], phase: o.phase ?? '', file: fileOf.get(raw) };
  });

  const traps = [...families.trap].map(([id, raw]) => {
    const o = resolve('trap', raw);
    return { id, ...named(o, id), sym: sym(o), color: color(o), flags: flagsOf(o), hidden: Boolean(o.always_invisible) || (o.visibility ?? 0) >= 99, file: fileOf.get(raw) };
  });

  // Category names (translated when possible).
  const itemCat = Object.fromEntries([...families.itemCat].map(([id, o]) => { const n = nameOf(o.name_header ?? o.name); return [id, (n && translate(n)) ?? n?.en ?? id]; }));
  const vpartCat = Object.fromEntries([...families.vpartCat].filter(([id]) => !id.startsWith('_')).map(([id, o]) => { const n = nameOf(o.name); return [id, (n && translate(n)) ?? n?.en ?? id]; }));

  const byId = (a, b) => a.id.localeCompare(b.id);
  return {
    labels: { itemCat, vpartCat },
    ter: feature('ter').sort(byId),
    furn: feature('furn').sort(byId),
    item: items.sort(byId),
    monster: monsters.sort(byId),
    vehicle: vehicles.sort(byId),
    vpart: vparts.sort(byId),
    field: fields.filter((f) => f.id !== 'fd_null').sort(byId),
    trap: traps.filter((t) => t.id !== 'tr_null').sort(byId),
  };
}

/** Translation contexts of the category names (vp_categories.json: { "ctxt": "vp_category" }). */
const LABEL_CTXT = { vpartCat: 'vp_category' };

/** The gettext lookup the engine does: with the context first, then the bare English string. */
const lookup = (map, en, ctxt) => (ctxt ? map.get(`${ctxt}\u0004${en}`) : undefined) ?? map.get(en);

/**
 * One language's names for an English catalog: official translations from `map` (readPo),
 * else `extra` (tools/editor/names/<lang>.json: { kind: { id: name } }, also "variant" and
 * "itemCat" / "vpartCat"), whose ids are listed under `generated`. Untranslated ids are left
 * out: the studio shows the English name.
 */
export function buildNames(catalog, map, extra = {}, lang = '') {
  const { labels, ...kinds } = catalog;
  const names = { lang, kinds: {}, variant: {}, labels: {}, generated: {} };
  const put = (group, id, en, ctxt, into) => {
    const official = lookup(map, en, ctxt);
    const made = official ? undefined : extra[group]?.[id];
    if (official || made) into[id] = official ?? made;
    if (made) (names.generated[group] ??= []).push(id);
  };
  for (const [kind, entries] of Object.entries(kinds)) {
    const into = (names.kinds[kind] = {});
    for (const e of entries) {
      put(kind, e.id, e.en, e.ctxt, into);
      for (const v of e.variants ?? []) put('variant', v.id, v.en, v.ctxt, names.variant);
    }
  }
  for (const [group, table] of Object.entries(labels)) {
    names.labels[group] = {};
    for (const [id, en] of Object.entries(table)) put(group, id, en, LABEL_CTXT[group], names.labels[group]);
  }
  return names;
}

/** English names that `names` leaves untranslated: { kind: { id: en } } (for filling extra). */
export function missingNames(catalog, names) {
  const { labels, ...kinds } = catalog;
  const out = {};
  for (const [kind, entries] of Object.entries(kinds)) {
    for (const e of entries) {
      if (!names.kinds[kind][e.id]) (out[kind] ??= {})[e.id] = e.en;
      for (const v of e.variants ?? []) if (!names.variant[v.id]) (out.variant ??= {})[v.id] = v.en;
    }
  }
  for (const [group, table] of Object.entries(labels)) for (const [id, en] of Object.entries(table)) if (!names.labels[group][id]) (out[group] ??= {})[id] = en;
  return out;
}

/**
 * Where the CDDA checkout is: $CDDA_DIR (a CDDA source tree or install with data/json and
 * lang/mo), else vendor/cdda in this repo. $CDDA_LANG picks the translation (default zh_CN).
 */
export function cddaPaths(root) {
  const dir = process.env.CDDA_DIR ?? join(root, 'vendor/cdda');
  const lang = process.env.CDDA_LANG ?? 'zh_CN';
  return { jsonRoot: join(dir, 'data/json'), mo: join(dir, `lang/mo/${lang}/LC_MESSAGES/cataclysm-dda.mo`), lang };
}

/** Folder of the generated catalogs (one subfolder per CDDA version) and their index. */
export const CATALOG_DIR = 'public/data/cdda';

/**
 * Write one CDDA version: public/data/cdda/<version>/catalog.json (English names) and
 * names.<lang>.json per language, and list it in public/data/cdda/index.json (newest first).
 * `info`: { version, commit, translations }; `names`: { lang: buildNames(...) }.
 */
export function writeCatalog(root, catalog, info, names = {}) {
  if (!/^[A-Za-z0-9._-]+$/.test(info.version ?? '')) throw new Error('--version must be a plain name, e.g. experimental-2026-11-14');
  const { labels, ...kinds } = catalog;
  const counts = Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v.length]));
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const langs = Object.fromEntries(Object.entries(names).map(([lang, n]) => {
    const translated = Object.values(n.kinds).reduce((a, t) => a + Object.keys(t).length, 0);
    const generated = Object.entries(n.generated).filter(([g]) => g in kinds).reduce((a, [, ids]) => a + ids.length, 0);
    return [lang, { path: `${info.version}/names.${lang}.json`, translated, generated, total }];
  }));
  const meta = {
    cdda: info.version,
    ...(info.commit ? { commit: info.commit } : {}),
    ...(info.translations ? { translations: info.translations } : {}),
    generated: new Date().toISOString().slice(0, 10),
    counts,
    langs,
    license: 'Derived from Cataclysm: Dark Days Ahead data and translations (https://github.com/CleverRaven/Cataclysm-DDA), CC BY-SA 3.0.',
  };
  const dir = join(root, CATALOG_DIR, info.version);
  mkdirSync(dir, { recursive: true });
  // The English catalog: "name" is the English name, so it is not stored twice.
  const strip = (e) => { const { name: _name, ...rest } = e; return rest.variants ? { ...rest, variants: rest.variants.map(({ name: _n, ...v }) => v) } : rest; };
  const english = { labels, ...Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v.map(strip)])) };
  writeFileSync(join(dir, 'catalog.json'), `${JSON.stringify({ meta, ...english })}\n`);
  for (const [lang, n] of Object.entries(names)) writeFileSync(join(dir, `names.${lang}.json`), `${JSON.stringify(n)}\n`);
  const indexPath = join(root, CATALOG_DIR, 'index.json');
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : { versions: [] };
  index.versions = [{ id: info.version, path: `${info.version}/catalog.json`, ...meta }, ...index.versions.filter((v) => v.id !== info.version)];
  writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`);
  return { meta, dir };
}

/** Studio-made names for what the official translation lacks: tools/editor/names/<lang>.json. */
export function readExtraNames(root, lang) {
  const p = join(root, 'tools/editor/names', `${lang}.json`);
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}

// node tools/editor/catalog.mjs                                  print counts
// node tools/editor/catalog.mjs --write --version <name> --translations <release tag> [--commit <sha>]
//   names for every vendor/translations/<tag>/<lang>.po (node tools/fetch-translations.mjs <tag>)
// node tools/editor/catalog.mjs --missing <lang> --translations <tag>   untranslated names as JSON
if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL('../../', import.meta.url).pathname;
  const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const t0 = Date.now();
  const { jsonRoot } = cddaPaths(root);
  const c = buildCatalog(jsonRoot);
  const { labels: _labels, ...kinds } = c;
  const tag = arg('translations');
  const poDir = tag ? join(root, 'vendor/translations', tag) : null;
  const langs = poDir && existsSync(poDir) ? readdirSync(poDir).filter((f) => f.endsWith('.po')).map((f) => f.slice(0, -3)) : [];
  const names = Object.fromEntries(langs.map((lang) => [lang, buildNames(c, readPo(join(poDir, `${lang}.po`)), readExtraNames(root, lang), lang)]));
  if (arg('missing')) {
    const lang = arg('missing');
    if (!names[lang]) throw new Error(`no ${lang}.po under ${poDir}`);
    const official = buildNames(c, readPo(join(poDir, `${lang}.po`)), {}, lang);
    console.log(JSON.stringify(missingNames(c, official), null, 1));
  } else {
    console.error(Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v.length])), `${Date.now() - t0} ms`, langs);
    if (process.argv.includes('--write')) {
      const { dir, meta } = writeCatalog(root, c, { version: arg('version'), commit: arg('commit'), translations: tag }, names);
      console.error('wrote', dir, meta.langs);
    }
  }
}
