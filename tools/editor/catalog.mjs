// The model editor's object catalog, read from the CDDA data files (no engine needed):
// terrain, furniture, items, monsters, vehicles, vehicle parts, fields and traps with the
// same fields the engine's catalog message carries (native/bridge/catalog.cpp), plus English
// and Chinese names, and the Chinese names of the item and vehicle-part categories.
// Run directly to print counts: node tools/editor/catalog.mjs
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

/** English name of a CDDA "name" member and its gettext key. */
function nameOf(n) {
  if (!n) return null;
  if (typeof n === 'string') return { en: n, key: n };
  const en = n.str ?? n.str_sp;
  if (!en) return null;
  return { en, key: n.ctxt ? `${n.ctxt}\u0004${en}` : en };
}

const ITEM_TYPES = new Set([
  'GENERIC', 'ITEM', 'TOOL', 'ARMOR', 'TOOL_ARMOR', 'PET_ARMOR', 'COMESTIBLE', 'GUN', 'GUNMOD', 'AMMO', 'MAGAZINE',
  'BOOK', 'CONTAINER', 'BIONIC_ITEM', 'ENGINE', 'WHEEL', 'BATTERY', 'TOOLMOD',
]);

/** "62500 ml" / "62.5 L" → millilitres. */
function millilitres(v) {
  if (typeof v === 'number') return v;
  const m = /^\s*([\d.]+)\s*(ml|L)\s*$/i.exec(String(v ?? ''));
  if (!m) return null;
  return Number(m[1]) * (m[2].toLowerCase() === 'l' ? 1000 : 1);
}

/** CDDA's volume_to_size (src/monstergenerator.cpp): 1 tiny … 5 huge. */
function sizeClass(ml) {
  if (ml === null) return 3;
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
 * Build the catalog. `jsonRoot`: vendor/cdda/data/json. `moPath`: the zh_CN .mo (optional).
 * Each entry: { id, name, en, sym, color, flags, … } with kind-specific fields.
 */
export function buildCatalog(jsonRoot, moPath) {
  const zh = moPath ? readMo(moPath) : new Map();
  // Per JSON type family: concrete objects by id, abstracts by name (for copy-from).
  const FAMILY = { terrain: 'ter', furniture: 'furn', MONSTER: 'monster', vehicle: 'vehicle', vehicle_part: 'vpart', field_type: 'field', trap: 'trap', ITEM_CATEGORY: 'itemCat', vehicle_part_category: 'vpartCat' };
  const names = Object.values(FAMILY).concat('item');
  const families = Object.fromEntries(names.map((n) => [n, new Map()]));
  const abstracts = Object.fromEntries(names.map((n) => [n, new Map()]));
  const familyOf = (type) => FAMILY[type] ?? (ITEM_TYPES.has(type) ? 'item' : null);
  for (const file of walk(jsonRoot)) {
    let data;
    try {
      data = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    for (const o of Array.isArray(data) ? data : [data]) {
      if (!o || typeof o !== 'object') continue;
      const fam = familyOf(o.type);
      if (!fam) continue;
      if (o.abstract) abstracts[fam].set(o.abstract, o);
      for (const id of Array.isArray(o.id) ? o.id : o.id ? [o.id] : []) families[fam].set(id, o);
    }
  }
  const resolve = (fam, o, depth = 0) => {
    const from = o['copy-from'];
    if (!from || depth > 16) return o;
    const base = families[fam].get(from) ?? abstracts[fam].get(from);
    if (!base || base === o) return o;
    const merged = { ...resolve(fam, base, depth + 1), ...o };
    // "extend"/"delete" on flags, the only list the editor shows.
    const flags = new Set(merged.flags ?? []);
    for (const f of o.extend?.flags ?? []) flags.add(f);
    for (const f of o.delete?.flags ?? []) flags.delete(f);
    merged.flags = [...flags];
    return merged;
  };
  const translate = (n) => n && (zh.get(n.key) ?? zh.get(n.en));
  const named = (o, id, fallback) => {
    const n = nameOf(o.name) ?? fallback;
    const en = n?.en ?? id;
    return { en, name: translate(n) ?? en };
  };
  // Seasonal symbols / colours come as lists; take the first. Always strings.
  const first = (v) => (Array.isArray(v) ? v[0] : v);
  const sym = (o) => { const v = first(o.symbol); return typeof v === 'string' && v ? v : '?'; };
  const color = (o) => { const v = first(o.color) ?? first(o.bgcolor); return typeof v === 'string' ? v : 'light_gray'; };

  const feature = (fam) => [...families[fam]].map(([id, raw]) => {
    const o = resolve(fam, raw);
    return { id, ...named(o, id), sym: sym(o), color: color(o), move: o.move_cost ?? (fam === 'furn' ? o.move_cost_mod ?? 0 : 2), looksLike: o.looks_like ?? '', flags: o.flags ?? [] };
  });

  const items = [...families.item].map(([id, raw]) => {
    const o = resolve('item', raw);
    const types = new Set([o.type, ...(o.subtypes ?? [])]);
    const covers = new Set();
    for (const a of o.armor ?? []) for (const c of a.covers ?? []) covers.add(c);
    return { id, ...named(o, id), sym: sym(o), color: color(o), cat: itemCategory(o, types), flags: o.flags ?? [], covers: [...covers], looksLike: o.looks_like ?? '' };
  });

  const monsters = [...families.monster].map(([id, raw]) => {
    const o = resolve('monster', raw);
    return {
      id, ...named(o, id), sym: sym(o), color: color(o), flags: o.flags ?? [],
      size: sizeClass(millilitres(o.volume)), body: o.bodytype ?? '', species: [o.species ?? []].flat(), looksLike: o.looks_like ?? '',
    };
  });

  const vehicles = [...families.vehicle].map(([id, raw]) => {
    const o = resolve('vehicle', raw);
    const xs = (o.parts ?? []).map((p) => p.x).filter((x) => typeof x === 'number');
    const ys = (o.parts ?? []).map((p) => p.y).filter((y) => typeof y === 'number');
    const span = (v) => (v.length ? Math.max(...v) - Math.min(...v) + 1 : 1);
    return { id, ...named(o, id), sym: '#', color: 'light_gray', flags: [], length: span(xs), width: span(ys) };
  });

  // Vehicle parts: named after their item when they have no name of their own.
  const vparts = [...families.vpart].map(([id, raw]) => {
    const o = resolve('vpart', raw);
    const item = o.item && families.item.get(o.item);
    const v = o.variants?.[0];
    const s = typeof v?.symbols === 'string' ? v.symbols[0] : sym(o);
    return { id, ...named(o, id, item ? nameOf(resolve('item', item).name) : null), sym: s || '?', color: color(o), flags: o.flags ?? [], cat: (o.categories ?? [])[0] ?? 'other', location: o.location ?? '' };
  });

  // Fields: named and coloured after their first intensity level.
  const fields = [...families.field].map(([id, raw]) => {
    const o = resolve('field', raw);
    const level = o.intensity_levels?.[0] ?? {};
    return { id, ...named(level, id), sym: typeof level.sym === 'string' && level.sym ? level.sym : '~', color: typeof level.color === 'string' ? level.color : 'white', flags: [], phase: o.phase ?? '' };
  });

  const traps = [...families.trap].map(([id, raw]) => {
    const o = resolve('trap', raw);
    return { id, ...named(o, id), sym: sym(o), color: color(o), flags: o.flags ?? [], hidden: Boolean(o.always_invisible) || (o.visibility ?? 0) >= 99 };
  });

  // Category names (Chinese when translated).
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

/**
 * Where the CDDA checkout is: $CDDA_DIR (a CDDA source tree or install with data/json and
 * lang/mo), else vendor/cdda in this repo. $CDDA_LANG picks the translation (default zh_CN).
 */
export function cddaPaths(root) {
  const dir = process.env.CDDA_DIR ?? join(root, 'vendor/cdda');
  const lang = process.env.CDDA_LANG ?? 'zh_CN';
  return { jsonRoot: join(dir, 'data/json'), mo: join(dir, `lang/mo/${lang}/LC_MESSAGES/cataclysm-dda.mo`) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const root = new URL('../../', import.meta.url).pathname;
  const t0 = Date.now();
  const { jsonRoot, mo } = cddaPaths(root);
  const c = buildCatalog(jsonRoot, mo);
  const { labels, ...kinds } = c;
  console.log(Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v.length])), `${Date.now() - t0} ms`, labels);
  for (const k of Object.keys(kinds)) console.log(k, JSON.stringify(c[k].find((e) => e.name !== e.en) ?? c[k][0]));
}
