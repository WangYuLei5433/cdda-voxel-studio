// CDDA Model Studio (index.html): browse every CDDA object, see the voxel model a voxel set
// gives it (cataclysm-3d's format: voxelset.json + MagicaVoxel .vox files), the mesh model a
// mesh set gives it (meshset.json + .glb / .gltf / .obj files), or a stand-in box sized from
// its CDDA data, next to a wall and a person at cataclysm-3d's scale.
import './editor.css';

import { loadMeshSets, meshItemKey, meshLibraryItems, type LoadedMeshSet, type MeshItem } from '../mesh/library';
import type { MeshEntry } from '../mesh/meshset';
import { colorOf } from '../render/classify';
import { WORLD } from '../render/world-scale';
import { builtinGroup, entryLabel, libraryItems, loadVoxelSets, setIdNamer } from '../vox/library';
import { VoxMatcher, voxId, type BuiltinKinds, type VoxMatch } from '../vox/match';
import { applyNames, EMPTY_CATALOG, search, STATUS_LABEL, type CatalogEntry, type CatalogIndex, type CatalogKind, type CatalogNames, type EditorCatalog, type Status } from './catalog';
import { lang, LANGS, listSep, setLang, t, type Lang } from './i18n';
import { esc, measureHtml, renderInspector } from './inspector';
import { Stage, type Measure, type View } from './stage';
import { buildMeshSubject, buildPlaceholder, buildVoxSubject, placeholderSize, type MeshMatch, type Subject } from './subject';
import { ThumbnailCache } from './thumbs';
import { branchOf, buildTree, inBranch, KIND_NAME, KINDS, pathOf, trail, type Kind, type TreeNode } from './tree';

type Tab = Kind;
const FILTERS: (Status | 'all')[] = ['all', 'voxel', 'mesh', 'none', 'library'];
const LIST_LIMIT = 400;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return res.ok && res.headers.get('content-type')?.includes('json') ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

// ── Data: CDDA catalog (per version, names per language) and voxel sets ─────────────────
const params = new URLSearchParams(location.search);
const catalogIndex = await fetchJson<CatalogIndex>('/data/cdda/index.json');
const catalogVersion = catalogIndex?.versions.find((v) => v.id === params.get('cdda')) ?? catalogIndex?.versions[0];
const catalog: EditorCatalog = { ...EMPTY_CATALOG, ...((catalogVersion && (await fetchJson<EditorCatalog>(`/data/cdda/${catalogVersion.path}`))) ?? {}) };
const namesPath = lang === 'en' ? undefined : catalogVersion?.langs?.[lang]?.path;
applyNames(catalog, namesPath ? await fetchJson<CatalogNames>(`/data/cdda/${namesPath}`) : null);

const [voxelSets, meshSets] = await Promise.all([loadVoxelSets(), loadMeshSets()]);
const voxItems = new Map(libraryItems(voxelSets).map((i) => [i.key, i]));
const meshItems = new Map(meshLibraryItems(meshSets).map((i) => [i.key, i]));
// Built-in model type per object (tools/classify/builtin-kinds.mjs), for sets that bind by type.
const builtinKinds = catalogVersion && (voxelSets.length || meshSets.length) ? await fetchJson<BuiltinKinds>(`/data/cdda/${catalogVersion.id}/builtin-kinds.json`) : null;
const matcher = new VoxMatcher(voxelSets, catalog, builtinKinds, voxItems);
const meshMatcher = new VoxMatcher<MeshEntry, LoadedMeshSet, MeshItem>(meshSets, catalog, builtinKinds, meshItems, meshItemKey);
const voxMatch = (kind: Tab, id: string, v = 0) => (kind === 'vox' || !matcher.active ? null : matcher.find(kind, id, v));
const meshMatch = (kind: Tab, id: string, v = 0) => (kind === 'vox' || !meshMatcher.active ? null : meshMatcher.find(kind, id, v));
// The more precise match wins (own id, then looks_like, then built-in type); on a tie the voxel
// set wins (it works in cataclysm-3d too). A mesh made for this exact id beats a voxel model
// the object only gets through its built-in type.
const PRECISION = { id: 0, looks_like: 1, builtin: 2 } as const;
function modelMatch(kind: Tab, id: string, v = 0) {
  const vm = voxMatch(kind, id, v), mm = meshMatch(kind, id, v);
  if (vm && (!mm || PRECISION[vm.via] <= PRECISION[mm.via])) return { format: 'vox' as const, vm };
  return mm ? { format: 'mesh' as const, mm } : null;
}

/** One way to show an object: a set's model, or the stand-in box. */
interface Source {
  /** "vox:<set>", "mesh:<set>" or "box". */
  key: string;
  label: string;
  format: 'vox' | 'mesh' | 'box';
  vm?: VoxMatch;
  mm?: MeshMatch;
}
const viaLabel = (m: { via: string; matched: string }) => (m.via === 'id' ? 'id' : m.via === 'looks_like' ? `looks_like ${m.matched}` : `${t('原型')} ${m.matched}`);
/**
 * Every source the object can be shown from: each voxel and mesh set that has a model for it
 * (modelMatch's choice first, then voxel sets and mesh sets in load order) and the stand-in box.
 * Empty when no set has a model (the box is then the only choice).
 */
function sourcesOf(kind: Tab, id: string, v = 0): Source[] {
  if (kind === 'vox') return [];
  const all: Source[] = [
    ...(matcher.active ? matcher.findAll(kind, id, v) : []).map((vm): Source => ({ key: `vox:${vm.set.id}`, label: `${vm.set.set.name} · ${viaLabel(vm)}`, format: 'vox', vm })),
    ...(meshMatcher.active ? meshMatcher.findAll(kind, id, v) : []).map((mm): Source => ({ key: `mesh:${mm.set.id}`, label: `${mm.set.set.name} · ${viaLabel(mm)}`, format: 'mesh', mm })),
  ];
  if (!all.length) return [];
  const best = modelMatch(kind, id, v);
  const bestKey = best?.format === 'vox' ? `vox:${best.vm.set.id}` : best ? `mesh:${best.mm.set.id}` : null;
  all.sort((a, b) => Number(b.key === bestKey) - Number(a.key === bestKey));
  return [...all, { key: 'box', label: t('占位长方体'), format: 'box' }];
}

// ── Static texts, language picker, header ───────────────────────────────────────────────
document.documentElement.lang = lang === 'zh_CN' ? 'zh' : lang;
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n!);
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle!);
for (const el of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder!);
document.title = t('CDDA 模型工作室');
const langSelect = $<HTMLSelectElement>('#ed-lang');
langSelect.innerHTML = LANGS.map(([l, label]) => `<option value="${l}" ${l === lang ? 'selected' : ''}>${label}</option>`).join('');
langSelect.addEventListener('change', () => setLang(langSelect.value as Lang));
const stage = new Stage($<HTMLCanvasElement>('#ed-canvas'));
$('#ed-world').textContent = t('墙高 {wall} 格 · 人高 {person} 格', { wall: WORLD.wallHeight, person: WORLD.personHeight });
$('#ed-pack').textContent = t('体素素材集 {n} 个 · 网格素材集 {k} 个 · 模型 {m} 个', { n: voxelSets.length, k: meshSets.length, m: voxItems.size + meshItems.size });
$('#ed-cdda').textContent = catalogVersion ? `CDDA ${catalogVersion.cdda}` : t('未找到 CDDA 对象表');

// ── State ───────────────────────────────────────────────────────────────────────────────
const KIND_IDS = KINDS.map(([k]) => k);
const urlKind = KIND_IDS.includes(params.get('kind') as Tab) ? (params.get('kind') as Tab) : null;
let query = params.get('q') ?? '';
let filter: Status | 'all' = 'all';
let selected: { kind: Tab; id: string } | null = urlKind && params.get('id') ? { kind: urlKind, id: params.get('id')! } : null;
let variant = 0;
/** The source shown instead of the default one (?src=), or null. */
let source: string | null = params.get('src');
let sources: Source[] = [];
/** Try on: a library file (model library key) shown on the selected object instead of its own model (?try=). */
let tryOn: string | null = params.get('try');
let tryOpen = false;
let tryQuery = '';
/** "Try on an object" (a library file selected): the object search. */
let targetQuery = '';
let activeSource: string | null = null;
let subject: Subject | null = null;
let measure: Measure | null = null;
let view: View = 'iso';
let loadToken = 0;
const statusCache = new Map<string, Status>();

// List or thumbnail grid, and the grid's cell size: remembered in this browser.
type Layout = 'list' | 'grid';
type CellSize = 's' | 'm' | 'l';
const CELL_SIZES: [CellSize, string][] = [['s', t('小')], ['m', t('中')], ['l', t('大')]];
function stored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}
function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private window: not remembered */
  }
}
let layout: Layout = stored<Layout>('vox-editor-layout', ['list', 'grid'], 'list');
let cellSize: CellSize = stored<CellSize>('vox-editor-cell', ['s', 'm', 'l'], 'm');
const thumbs = new ThumbnailCache();

// Names of bound ids: the CDDA catalog's (in the interface language), and cataclysm-3d's
// character ids, which the catalog does not have.
const CHARACTER_NAMES: Record<string, string> = { player: t('玩家'), player_male: t('玩家（男）'), player_female: t('玩家（女）'), npc: 'NPC', npc_male: t('NPC（男）'), npc_female: t('NPC（女）') };
const nameById = new Map<string, string>();
for (const k of ['ter', 'furn', 'item', 'monster', 'vehicle', 'vpart', 'field', 'trap'] as const) for (const e of catalog[k]) nameById.set(k === 'vpart' ? `vp_${e.id}` : e.id, e.name);
const idName = (id: string): string | undefined => nameById.get(id) ?? CHARACTER_NAMES[id];
setIdNamer(idName);
/** A set entry's own display name (`names`: { zh_CN, en, ru }), for files bound to nothing. */
function ownName(entries: Record<string, unknown>[]): string | null {
  const n = entries.find((e) => e.names && typeof e.names === 'object')?.names as Record<string, string> | undefined;
  return n ? n[lang] ?? n.en ?? null : null;
}

/** A library file's title: the names of the objects it is bound to, if any. */
function boundName(entries: { id?: string | string[] }[]): string | null {
  const names = [...new Set(entries.flatMap((e) => [e.id ?? []].flat()).map(idName).filter((n): n is string => Boolean(n)))];
  if (!names.length) return null;
  return names.length <= 2 ? names.join(listSep()) : t('{name} 等（共 {n} 个）', { name: names[0], n: names.length });
}

// The model library: every file of every voxel set and mesh set, titled by what it is bound to.
const fileName = (file: string) => file.replace(/^.*\//, '').replace(/\.(vox|glb|gltf|obj)$/i, '');
const vox0: CatalogEntry[] = [
  ...[...voxItems.values()].map((i) => ({
    id: i.key, name: boundName(i.entries) ?? ownName(i.entries) ?? fileName(i.file), en: [fileName(i.file), ...i.entries.map(entryLabel)].join(' · '), sym: '▣', color: 'light_gray', flags: [],
    cat: builtinGroup(i.entries[0]?.builtin), voxSet: i.set.id, voxSetName: t('体素集：{name}', { name: i.set.set.name }),
  })),
  ...[...meshItems.values()].map((i) => ({
    id: i.key, name: boundName(i.entries) ?? ownName(i.entries) ?? fileName(i.file), en: [fileName(i.file), ...i.entries.map(entryLabel)].join(' · ').replace(/ · $/, ''), sym: '◆', color: 'light_cyan', flags: [],
    cat: builtinGroup(i.entries[0]?.builtin), voxSet: `mesh:${i.set.id}`, voxSetName: t('网格集：{name}', { name: i.set.set.name }),
  })),
];
const entriesOf = (k: Tab): CatalogEntry[] => (k === 'vox' ? vox0 : catalog[k]);

// ── Object tree: every kind split into branches ─────────────────────────────────────────
const branchSegs = (kind: Tab, e: CatalogEntry) => branchOf(kind, e, catalog.labels);
const tree: TreeNode[] = buildTree(KIND_IDS.map((kind) => ({ kind, entries: entriesOf(kind), branch: (e: CatalogEntry) => branchSegs(kind, e) })));
const ALL = '';
const pathCache = new Map<string, string>();
function objectPath(kind: Tab, e: CatalogEntry): string {
  const key = `${kind}:${e.id}`;
  let p = pathCache.get(key);
  if (p === undefined) pathCache.set(key, (p = pathOf(kind, branchSegs(kind, e))));
  return p;
}
const validBranch = (b: string | null) => b !== null && (b === ALL || trail(tree, b).at(-1)?.path === b);
let branch: string = validBranch(params.get('branch')) ? params.get('branch')! : urlKind ?? 'furn';
const kindOf = (path: string) => path.split('/')[0] as Tab;
const branchLabel = (path: string) => (path === ALL ? t('全部对象') : trail(tree, path).map((n) => n.label).join(' › '));
const expanded = new Set<string>();

function status(k: Tab, e: CatalogEntry): Status {
  const key = `${k}:${e.id}`;
  let s = statusCache.get(key);
  if (!s) {
    const found = k === 'vox' ? null : modelMatch(k, e.id);
    s = k === 'vox' ? 'library' : found?.format === 'vox' ? 'voxel' : found ? 'mesh' : 'none';
    statusCache.set(key, s);
  }
  return s;
}

// ── Left: branch picker (dropdown tree), filters, list ──────────────────────────────────
const total = tree.reduce((n, r) => n + r.count, 0);

function treeHtml(nodes: TreeNode[], depth: number): string {
  return `<ul role="group">${nodes.map((n) => {
    const open = expanded.has(n.path);
    const caret = n.children.length ? `<button type="button" class="caret" data-expand="${esc(n.path)}" aria-label="${open ? t('折叠') : t('展开')}">${open ? '▾' : '▸'}</button>` : '<span class="caret"></span>';
    return `<li role="treeitem" aria-expanded="${n.children.length ? open : ''}"><div class="node${n.path === branch ? ' on' : ''}" style="padding-left:${depth * 14}px">${caret}<button type="button" class="pick" data-path="${esc(n.path)}">${esc(n.label)}</button><span class="n">${n.count}</span></div>${open && n.children.length ? treeHtml(n.children, depth + 1) : ''}</li>`;
  }).join('')}</ul>`;
}

/** Open the tree down to the current branch (and the branch itself, if it has children). */
function revealBranch(): void {
  for (const n of trail(tree, branch)) if (n.children.length) expanded.add(n.path);
}

function renderTree(): void {
  const count = branch === ALL ? total : trail(tree, branch).at(-1)?.count ?? 0;
  $('#ed-branch').innerHTML = `<span class="label">${esc(branchLabel(branch))}</span><span class="n">${count}</span><span class="arrow">${$('#ed-tree').hidden ? '▾' : '▴'}</span>`;
  $('#ed-tree').innerHTML = `<div class="node${branch === ALL ? ' on' : ''}"><span class="caret"></span><button type="button" class="pick" data-path="">${t('全部对象')}</button><span class="n">${total}</span></div>${treeHtml(tree, 0)}`;
}

function setBranch(path: string): void {
  branch = path;
  filter = 'all';
  const url = new URL(location.href);
  url.searchParams.set('branch', path);
  history.replaceState(null, '', url);
  revealBranch();
  renderTree();
  renderList();
}

function toggleTree(open = $('#ed-tree').hidden): void {
  $('#ed-tree').hidden = !open;
  $('#ed-branch').setAttribute('aria-expanded', String(open));
  renderTree();
  if (open) $('#ed-tree').querySelector('.node.on')?.scrollIntoView({ block: 'nearest' });
}

/** Objects in the current branch, each with its kind. */
function branchEntries(): { kind: Tab; e: CatalogEntry }[] {
  const kinds = branch === ALL ? KIND_IDS : [kindOf(branch)];
  const out: { kind: Tab; e: CatalogEntry }[] = [];
  for (const kind of kinds) for (const e of entriesOf(kind)) if (branch === ALL || branch === kind || inBranch(objectPath(kind, e), branch)) out.push({ kind, e });
  return out;
}

function renderList(): void {
  const all = branchEntries();
  const kindById = new Map(all.map((x) => [x.e, x.kind]));
  const found = search(all.map((x) => x.e), query).map((e) => ({ kind: kindById.get(e)!, e }));
  const counts = new Map<Status | 'all', number>([['all', found.length]]);
  for (const { kind, e } of found) counts.set(status(kind, e), (counts.get(status(kind, e)) ?? 0) + 1);
  $('#ed-filters').innerHTML = FILTERS.filter((f) => f === 'all' || counts.get(f))
    .map((f) => `<button type="button" data-filter="${f}" class="${f === filter ? 'on' : ''}">${f === 'all' ? t('全部') : `<span class="dot st-${f}"></span> ${STATUS_LABEL[f]}`}<span class="n">${counts.get(f) ?? 0}</span></button>`)
    .join('');
  const shown = filter === 'all' ? found : found.filter(({ kind, e }) => status(kind, e) === filter);
  $('#ed-count').textContent = `${branchLabel(branch)} ${t('{n} 项 · 匹配 {m} 项', { n: all.length, m: shown.length })}`;
  const mixed = branch === ALL;
  const grid = layout === 'grid';
  const list = $('#ed-list');
  list.className = grid ? `ed-list grid cell-${cellSize}` : 'ed-list';
  list.innerHTML =
    shown.slice(0, LIST_LIMIT).map(({ kind, e }) => {
      const st = status(kind, e);
      const sel = selected?.kind === kind && selected.id === e.id;
      const mark = '';
      const sym = `<span class="sym" style="color:${symColor(e.color)}">${esc(e.sym)}</span>`;
      if (grid) {
        const url = thumbs.peek(`${kind}:${e.id}`);
        const pic = url ? `<img alt="" src="${url}">` : sym;
        return `<li role="option" data-kind="${kind}" data-id="${esc(e.id)}" aria-selected="${sel}" title="${esc(`${e.name} · ${e.id}\n${mixed ? `${KIND_NAME[kind]} · ` : ''}${STATUS_LABEL[st]}`)}"><span class="th${url === undefined ? ' wait' : ''}">${pic}</span><span class="nm">${esc(e.name)}${mark}</span><span class="dot st-${st}"></span></li>`;
      }
      return `<li role="option" data-kind="${kind}" data-id="${esc(e.id)}" aria-selected="${sel}" title="${esc(STATUS_LABEL[st])}">${sym}<span class="names"><b>${esc(e.name)}${mark}</b><small>${mixed ? `${KIND_NAME[kind]} · ` : ''}${esc(e.id)}</small></span><span class="dot st-${st}"></span></li>`;
    }).join('') + (shown.length > LIST_LIMIT ? `<li class="more">${t('还有 {n} 项，请缩小搜索或选更细的分支', { n: shown.length - LIST_LIMIT })}</li>` : '');
  renderLayout();
  if (grid) observeThumbs();
}

function renderLayout(): void {
  const grid = layout === 'grid';
  $('#ed-layout').innerHTML = `<button type="button" data-layout="list" class="${grid ? '' : 'on'}" title="${t('列表')}">☰</button><button type="button" data-layout="grid" class="${grid ? 'on' : ''}" title="${t('缩略图网格')}">▦</button>${grid ? `<span class="sep"></span>${CELL_SIZES.map(([s, l]) => `<button type="button" data-cell="${s}" class="${s === cellSize ? 'on' : ''}" title="${t('格子大小')}">${l}</button>`).join('')}` : ''}`;
}

// Grid thumbnails: rendered when a cell scrolls into view, dropped from the queue when it leaves.
const thumbObserver = new IntersectionObserver((records) => {
  for (const r of records) {
    const li = (r.target as HTMLElement).closest<HTMLElement>('li[data-id]');
    if (!li) continue;
    const kind = li.dataset.kind as Tab;
    const id = li.dataset.id!;
    const key = `${kind}:${id}`;
    if (!r.isIntersecting) {
      thumbs.cancel(key);
      continue;
    }
    const entry = entriesOf(kind).find((x) => x.id === id);
    if (!entry) continue;
    void thumbs.request(key, () => buildFor(kind, entry, 0)).then((url) => {
      const cell = r.target as HTMLElement;
      thumbObserver.unobserve(cell);
      cell.classList.remove('wait');
      if (url && cell.isConnected) cell.innerHTML = `<img alt="" src="${url}">`;
    });
  }
}, { root: $('#ed-list'), rootMargin: '120px 0px' });

function observeThumbs(): void {
  thumbObserver.disconnect();
  for (const cell of $('#ed-list').querySelectorAll<HTMLElement>('.th.wait')) thumbObserver.observe(cell);
}

function setLayout(next: Layout, size = cellSize): void {
  layout = next;
  cellSize = size;
  store('vox-editor-layout', layout);
  store('vox-editor-cell', cellSize);
  renderList();
  $('#ed-list').querySelector<HTMLElement>('li[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
}

const SYM_COLORS: Record<string, string> = { red: '#e0605a', green: '#6fbf73', brown: '#b58a5a', blue: '#7a9bff', magenta: '#d070b0', cyan: '#5fc8d8', yellow: '#e8d060', white: '#eee', black: '#888', pink: '#f0a0d0' };
function symColor(c: string): string {
  const base = c.replace(/^[a-z]_/, '').replace(/^(light|dark)_/, '').replace(/_.*$/, '');
  return SYM_COLORS[base] ?? '#bbb';
}

// ── Selection → stage + inspector ───────────────────────────────────────────────────────
function entryOf(sel: { kind: Tab; id: string }): CatalogEntry | undefined {
  return entriesOf(sel.kind).find((e) => e.id === sel.id);
}

/**
 * An object's best model (modelMatch: the more precise of its voxel and mesh matches), else its
 * stand-in box; `from` (one of sourcesOf) shows that source instead.
 */
function buildFor(kind: Tab, entry: CatalogEntry, v: number, from?: Source): Promise<Subject> {
  if (kind === 'vox') {
    const mesh = meshItems.get(entry.id);
    return mesh ? buildMeshSubject(mesh) : buildVoxSubject(voxItems.get(entry.id)!);
  }
  const tintOf = (e: { tint?: unknown }) => (e.tint ? colorOf(entry.color) : undefined);
  if (from?.vm) return buildVoxSubject(from.vm.item, from.vm, tintOf(from.vm.entry));
  if (from?.mm) return buildMeshSubject(from.mm.item, from.mm, tintOf(from.mm.entry));
  if (from?.format === 'box') return Promise.resolve(buildPlaceholder(kind as CatalogKind, entry));
  const found = modelMatch(kind, entry.id, v);
  if (found?.format === 'vox') return buildVoxSubject(found.vm.item, found.vm, found.vm.entry.tint ? colorOf(entry.color) : undefined);
  if (found?.format === 'mesh') return buildMeshSubject(found.mm.item, found.mm, found.mm.entry.tint ? colorOf(entry.color) : undefined);
  return Promise.resolve(buildPlaceholder(kind as CatalogKind, entry));
}

/** Rebuild the shown object (after a selection or variant change). */
async function show(): Promise<void> {
  const sel = selected;
  const entry = sel && entryOf(sel);
  const token = ++loadToken;
  if (!sel || !entry) {
    stage.clear();
    $('#ed-inspector').innerHTML = `<p class="ed-empty">${t('从左侧选择一个对象。')}</p>`;
    $('#ed-measure').innerHTML = '';
    return;
  }
  $('#ed-loading').hidden = false;
  sources = sourcesOf(sel.kind, sel.id, variant);
  const chosen = sources.find((x) => x.key === source) ?? sources[0];
  const trying = sel.kind !== 'vox' && tryOn && (meshItems.has(tryOn) || voxItems.has(tryOn)) ? tryOn : null;
  activeSource = trying ? null : chosen?.key ?? null;
  let built: Subject;
  try {
    if (trying) {
      built = await buildTry(sel.kind, entry, trying);
      built.notes.unshift(t('试配：{file}（只是预览，未绑定）', { file: tryLabel(trying) }));
    } else {
      built = await buildFor(sel.kind, entry, variant, chosen);
      if (chosen && chosen !== sources[0]) built.notes.unshift(t('预览来源：{name}（默认显示：{base}）', { name: chosen.label, base: sources[0].label }));
    }
  } catch (err) {
    built = { ...buildPlaceholder(sel.kind === 'vox' ? 'furn' : sel.kind, entry), source: t('模型读取失败：{error}', { error: String((err as Error).message ?? err) }) };
  }
  if (token !== loadToken) return;
  $('#ed-loading').hidden = true;
  subject = built;
  measure = stage.show(built.object);
  stage.tick = built.update ?? null;
  stage.view(view);
  $('#ed-measure').innerHTML = measureHtml(measure);
  renderToolbar();
  const shown: Status = trying ? (meshItems.has(trying) ? 'mesh' : 'voxel') : !chosen || chosen === sources[0] ? status(sel.kind, entry) : chosen.format === 'vox' ? 'voxel' : chosen.format === 'mesh' ? 'mesh' : 'none';
  renderInspector($('#ed-inspector'), { kind: sel.kind, branch: branchLabel(objectPath(sel.kind, entry)), entry, status: shown, subject: built });
  renderPick();
}

function select(kind: Tab, id: string): void {
  const entry = entriesOf(kind).find((e) => e.id === id);
  if (entry && branch !== ALL && !inBranch(objectPath(kind, entry), branch)) {
    branch = kind;
    filter = 'all';
    revealBranch();
    renderTree();
  }
  if (selected?.id !== id || selected.kind !== kind) {
    variant = 0;
    source = null;
    tryOn = null;
  }
  selected = { kind, id };
  const url = new URL(location.href);
  url.searchParams.set('kind', kind);
  url.searchParams.set('id', id);
  if (source) url.searchParams.set('src', source);
  else url.searchParams.delete('src');
  if (!tryOn) url.searchParams.delete('try');
  history.replaceState(null, '', url);
  renderList();
  void show();
}

// ── Try on ──────────────────────────────────────────────────────────────────────────────
/**
 * The size a tried model gets on an object: a creature as tall as its CDDA volume suggests (or as
 * long, lying), an item as long as its longest side; anything else keeps the model's own size.
 */
function trySize(kind: Tab, e: CatalogEntry): Partial<MeshEntry> {
  const r = (n: number) => Math.round(n * 1000) / 1000;
  if (kind === 'monster') {
    const [w, h, d] = placeholderSize('monster', e).size;
    return h >= Math.max(w, d) ? { height: r(h) } : { fit: r(Math.max(w, d)) };
  }
  if (kind === 'item') return { fit: r((e.longestSide ?? 100) / 1000) };
  return {};
}

const tryLabel = (key: string) => {
  const item = meshItems.get(key) ?? voxItems.get(key);
  return item ? `${item.set.set.name} · ${item.file}` : key;
};

function buildTry(kind: Tab, e: CatalogEntry, key: string): Promise<Subject> {
  const mesh = meshItems.get(key);
  return mesh ? buildMeshSubject(mesh, undefined, undefined, trySize(kind, e)) : buildVoxSubject(voxItems.get(key)!);
}

/**
 * One line for tools/deadwood/mapping.json (cdda-cubeclysm-3d): the object's id, the tried file
 * as "<set>:<file>", where the library will keep it, and the size tried. `why` is left to fill in.
 */
function trySnippet(kind: Tab, e: CatalogEntry, key: string): string {
  const item = meshItems.get(key) ?? voxItems.get(key)!;
  const id = kind === 'vox' ? e.id : voxId(kind, e.id);
  const group = kind === 'monster' ? 'monsters' : kind === 'item' ? 'items' : kind;
  const ext = item.file.replace(/^.*\./, '');
  return JSON.stringify({ id, pool: `${item.set.id}:${item.file}`, file: `${group}/${id}.${ext}`, ...(meshItems.has(key) ? trySize(kind, e) : {}), why: '' });
}

function setTry(key: string | null): void {
  tryOn = key;
  const url = new URL(location.href);
  if (key) url.searchParams.set('try', key);
  else url.searchParams.delete('try');
  history.replaceState(null, '', url);
  void show();
}

/**
 * The inspector's model choices, under its "model" section: the sources the object can be shown
 * from, and Try on (a searchable thumbnail grid of every model library file). For a library file
 * the other way round: Try on an object (search a CDDA object, show this file on it).
 */
function renderPick(): void {
  const host = $('#ed-inspector');
  host.querySelector('#ed-pick')?.remove();
  if (!selected) return;
  const sections = host.querySelectorAll('.ed-sec');
  const after = sections[1] ?? sections[0];
  if (!after) return;
  let html: string;
  if (selected.kind === 'vox') {
    html = `<section class="ed-sec" id="ed-pick"><details id="ed-try" ${tryOpen ? 'open' : ''}><summary><b>${t('试配到对象')}</b> <span class="sub">${t('选一个 CDDA 对象，把这个模型套上去看')}</span></summary>
      <input id="ed-target-q" type="search" placeholder="${t('搜索对象 id 或名称…')}" value="${esc(targetQuery)}"><ul id="ed-target-list" class="ed-target-list"></ul></details></section>`;
  } else {
    const src = sources.length >= 2
      ? `<div class="ed-pick-row"><h3>${t('来源')}</h3><div class="ed-pick-buttons">${sources.map((x, i) => `<button type="button" data-source="${esc(x.key)}" class="${x.key === activeSource ? 'on' : ''}" title="${esc(i === 0 ? t('默认显示') : x.label)}">${esc(x.label)}${i === 0 ? ' ★' : ''}</button>`).join('')}</div></div>`
      : '';
    const trying = tryOn
      ? `<div class="ed-try-on"><span class="try-name" title="${esc(tryLabel(tryOn))}">${t('试配中：{name}', { name: esc(vox0.find((e) => e.id === tryOn)?.name ?? tryOn) })}</span><button type="button" class="primary" data-try-copy>${t('复制映射条目')}</button><button type="button" data-try-clear>${t('取消')}</button></div>`
      : '';
    html = `<section class="ed-sec" id="ed-pick">${src}<details id="ed-try" ${tryOpen || tryOn ? 'open' : ''}><summary><b>${t('试配')}</b> <span class="sub">${t('从模型库挑一个模型套到这个对象上')}</span></summary>${trying}
      <input id="ed-try-q" type="search" placeholder="${t('搜索模型文件…')}" value="${esc(tryQuery)}"><div class="hint" id="ed-try-hint"></div><ul id="ed-try-list" class="ed-try-list"></ul></details></section>`;
  }
  after.insertAdjacentHTML('afterend', html);
  if (selected.kind === 'vox') renderTargetList();
  else renderTryList();
}

/** Try on: the model library files matching the search, with thumbnails (only while open). */
function renderTryList(): void {
  const list = document.querySelector<HTMLElement>('#ed-try-list');
  if (!list || !document.querySelector<HTMLDetailsElement>('#ed-try')?.open) return;
  const words = tryQuery.toLowerCase().split(/\s+/).filter(Boolean);
  const found = vox0.filter((e) => words.every((w) => `${e.id} ${e.name} ${e.en} ${e.voxSetName ?? ''}`.toLowerCase().includes(w)));
  const shown = found.slice(0, 150);
  $('#ed-try-hint').textContent = found.length ? t('{n} 个模型，点一个套到当前对象上', { n: found.length }) : t('没有匹配的模型');
  list.innerHTML = shown.map((e) => {
    const url = thumbs.peek(`vox:${e.id}`);
    return `<li data-try="${esc(e.id)}" class="${e.id === tryOn ? 'on' : ''}" title="${esc(`${e.name}\n${e.en}\n${e.voxSetName ?? ''}`)}"><span class="th" data-th="${esc(e.id)}">${url ? `<img alt="" src="${url}">` : e.sym}</span><span class="nm">${esc(e.name)}</span></li>`;
  }).join('');
  for (const e of shown) {
    if (thumbs.peek(`vox:${e.id}`) !== undefined) continue;
    void thumbs.request(`vox:${e.id}`, () => buildFor('vox', e, 0)).then((url) => {
      const cell = list.querySelector<HTMLElement>(`[data-th="${CSS.escape(e.id)}"]`);
      if (url && cell) cell.innerHTML = `<img alt="" src="${url}">`;
    });
  }
}

/** Try on an object: CDDA objects matching the search, by kind. */
function renderTargetList(): void {
  const list = document.querySelector<HTMLElement>('#ed-target-list');
  if (!list) return;
  const q = targetQuery.trim();
  if (!q) {
    list.innerHTML = `<li class="hint">${t('输入 id 或名称，比如 mon_zombie_cop、警察')}</li>`;
    return;
  }
  const found = KIND_IDS.filter((k) => k !== 'vox').flatMap((k) => search(entriesOf(k), q).slice(0, 12).map((e) => ({ k, e }))).slice(0, 40);
  list.innerHTML = found.length
    ? found.map(({ k, e }) => `<li><button type="button" data-target-kind="${k}" data-target-id="${esc(e.id)}"><b>${esc(e.name)}</b><small>${KIND_NAME[k]} · ${esc(e.id)}</small></button></li>`).join('')
    : `<li class="hint">${t('没有匹配的对象')}</li>`;
}

async function copyTrySnippet(button: HTMLElement): Promise<void> {
  const entry = selected && entryOf(selected);
  if (!selected || !entry || !tryOn) return;
  const line = trySnippet(selected.kind, entry, tryOn);
  try {
    await navigator.clipboard.writeText(line);
    button.textContent = t('已复制');
    setTimeout(() => { button.textContent = t('复制映射条目'); }, 1500);
  } catch {
    window.prompt(t('复制这一行到 mapping.json：'), line);
  }
}

/** Show the object from another source (sourcesOf key); the default one clears ?src=. */
function setSource(key: string): void {
  source = key === sources[0]?.key ? null : key;
  variant = 0;
  const url = new URL(location.href);
  if (source) url.searchParams.set('src', source);
  else url.searchParams.delete('src');
  history.replaceState(null, '', url);
  void show();
}

// ── Toolbar ─────────────────────────────────────────────────────────────────────────────
const VIEWS: [View, string][] = [['iso', t('斜视')], ['front', t('正面')], ['side', t('侧面')], ['top', t('俯视')]];
const TOGGLES: [keyof Stage['options'], string][] = [['grid', t('网格')], ['wall', t('参照墙')], ['person', t('参照人')], ['bbox', t('包围盒')], ['wireframe', t('线框')]];

function renderToolbar(): void {
  $('#ed-views').innerHTML = `<label>${t('视角')}</label>${VIEWS.map(([v, l]) => `<button type="button" data-view="${v}" class="${v === view ? 'on' : ''}">${l}</button>`).join('')}`;
  $('#ed-toggles').innerHTML = TOGGLES.map(([k, l]) => `<button type="button" data-toggle="${k}" class="${stage.options[k] ? 'on' : ''}">${l}</button>`).join('');
  const variants = subject?.variants.length ?? 0;
  const vbox = $('#ed-variants');
  vbox.hidden = variants < 2;
  vbox.innerHTML = `<label>${t('变体')}</label><button type="button" data-variant="-1">‹</button><span class="mono" style="padding:0 4px">${(variant % Math.max(1, variants)) + 1}/${variants}</span><button type="button" data-variant="1">›</button>`;
  const clips = subject?.clips ?? [];
  const abox = $('#ed-anims');
  abox.hidden = !clips.length;
  abox.innerHTML = `<label>${t('动画')}</label><button type="button" data-clip="" class="${subject?.playing ? '' : 'on'}">${t('静止')}</button>${clips.map(([label, clip]) => `<button type="button" data-clip="${esc(clip)}" class="${subject?.playing === clip ? 'on' : ''}">${esc(label)}</button>`).join('')}`;
}

// ── Events ──────────────────────────────────────────────────────────────────────────────
$('#ed-branch').addEventListener('click', () => toggleTree());
$('#ed-tree').addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const exp = t.closest<HTMLElement>('[data-expand]')?.dataset.expand;
  if (exp !== undefined) {
    if (expanded.has(exp)) expanded.delete(exp);
    else expanded.add(exp);
    renderTree();
    return;
  }
  const path = t.closest<HTMLElement>('[data-path]')?.dataset.path;
  if (path === undefined) return;
  setBranch(path);
  toggleTree(false);
});
document.addEventListener('click', (e) => {
  // composedPath: the clicked node may already be replaced by a re-render.
  if (!$('#ed-tree').hidden && !e.composedPath().includes($('.ed-picker'))) toggleTree(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('#ed-tree').hidden) toggleTree(false);
});
let searchTimer: ReturnType<typeof setTimeout> | undefined;
$<HTMLInputElement>('#ed-search').value = query;
$('#ed-search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    query = (e.target as HTMLInputElement).value;
    renderList();
  }, 120);
});
$('#ed-filters').addEventListener('click', (e) => {
  const f = (e.target as HTMLElement).closest<HTMLElement>('[data-filter]')?.dataset.filter as Status | 'all' | undefined;
  if (!f) return;
  filter = f;
  renderList();
});
$('#ed-layout').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (b?.dataset.layout) setLayout(b.dataset.layout as Layout);
  else if (b?.dataset.cell) setLayout(layout, b.dataset.cell as CellSize);
});
$('#ed-list').addEventListener('click', (e) => {
  const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-id]');
  if (li) select(li.dataset.kind as Tab, li.dataset.id!);
});
$('#ed-list').addEventListener('keydown', (e) => {
  const items = [...$('#ed-list').querySelectorAll<HTMLElement>('li[data-id]')];
  // In the grid, up / down move a whole row; left / right one cell.
  const columns = layout === 'grid' ? Math.max(1, items.filter((li) => li.offsetTop === items[0]?.offsetTop).length) : 1;
  const step = { ArrowDown: columns, ArrowUp: -columns, ArrowRight: layout === 'grid' ? 1 : 0, ArrowLeft: layout === 'grid' ? -1 : 0 }[e.key];
  if (!step) return;
  const at = items.findIndex((li) => li.getAttribute('aria-selected') === 'true');
  const next = items[Math.max(0, Math.min(items.length - 1, at < 0 ? 0 : at + step))];
  if (next) {
    e.preventDefault();
    select(next.dataset.kind as Tab, next.dataset.id!);
    $('#ed-list').querySelector<HTMLElement>('li[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
});
$('#ed-list').tabIndex = 0;

document.querySelector('.ed-toolbar')!.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button');
  if (!b) return;
  if (b.dataset.view) {
    view = b.dataset.view as View;
    stage.view(view);
    renderToolbar();
  } else if (b.dataset.toggle) {
    const k = b.dataset.toggle as keyof Stage['options'];
    stage.setOptions({ [k]: !stage.options[k] });
    renderToolbar();
  } else if (b.dataset.variant) {
    variant = Math.max(0, variant + Number(b.dataset.variant));
    void show();
  } else if (b.dataset.clip !== undefined && subject?.play) {
    subject.play(b.dataset.clip || null);
    renderToolbar();
  }
});

// Model choices in the inspector (renderPick): sources, Try on, Try on an object.
$('#ed-inspector').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button, li[data-try]');
  if (!b) return;
  if (b.dataset.source) setSource(b.dataset.source);
  else if (b.dataset.try) setTry(b.dataset.try);
  else if (b.dataset.tryCopy !== undefined) void copyTrySnippet(b);
  else if (b.dataset.tryClear !== undefined) setTry(null);
  else if (b.dataset.targetId && selected) {
    // Show this library file on the chosen object.
    const file = selected.id;
    tryOpen = true;
    select(b.dataset.targetKind as Tab, b.dataset.targetId);
    setTry(file);
  }
});
$('#ed-inspector').addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === 'ed-try-q') {
    tryQuery = el.value;
    renderTryList();
  } else if (el.id === 'ed-target-q') {
    targetQuery = el.value;
    renderTargetList();
  }
});
// <details> toggles do not bubble; listen while capturing.
$('#ed-inspector').addEventListener('toggle', (e) => {
  if ((e.target as HTMLElement).id !== 'ed-try') return;
  tryOpen = (e.target as HTMLDetailsElement).open;
  if (tryOpen) renderTryList();
}, true);

revealBranch();
renderTree();
renderList();
renderToolbar();
await show();

// Test / automation hook.
Object.assign(window, {
  __editor: {
    get ready() { return stage.frames > 5 && $('#ed-loading').hidden; },
    get frames() { return stage.frames; },
    get selected() { return selected; },
    get measure() { return measure; },
    get subject() { return subject && { source: subject.source, variants: subject.variants, notes: subject.notes, clips: subject.clips ?? [], playing: subject.playing ?? null }; },
    play: (clip: string | null) => { subject?.play?.(clip); renderToolbar(); },
    get sources() { return { list: sources.map(({ key, label }) => ({ key, label })), active: activeSource }; },
    setSource: (key: string) => setSource(key),
    get tryOn() { return tryOn; },
    setTry: (key: string | null) => setTry(key),
    trySnippet: () => (selected && tryOn && entryOf(selected) ? trySnippet(selected.kind, entryOf(selected)!, tryOn) : null),
    get status() { return selected ? status(selected.kind, entryOf(selected)!) : null; },
    get branch() { return branch; },
    get layout() { return { layout, cellSize }; },
    setLayout: (l: Layout, size?: CellSize) => setLayout(l, size),
    tree: () => tree,
    setBranch: (path: string) => setBranch(path),
    get world() { return { ...WORLD }; },
    catalogSizes: Object.fromEntries(KIND_IDS.map((k) => [k, entriesOf(k).length])),
    select: (kind: Tab, id: string) => select(kind, id),
  },
});
