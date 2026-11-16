// CDDA model studio (index.html): find any CDDA object or model, preview it — model,
// texture, variants, animations and size next to a wall and a person — and change which
// model it uses and how it is placed. Edits are saved to the local overrides file
// (src/render/appearance.ts LOCAL_OVERRIDES).
import './editor.css';

import { Appearance, LOCAL_OVERRIDES, LOCAL_PACKS, type AppearanceDoc } from '../render/appearance';
import { ModelLibrary, type ClipRole } from '../render/models';
import { TextureLibrary } from '../render/textures';
import { useMetricWorld, useVoxelWorld, WORLD } from '../render/world-scale';
import { builtinGroup, entryLabel, libraryItems, loadVoxelSets } from '../vox/library';
import { VoxMatcher, type BuiltinKinds } from '../vox/match';
import { colorOf } from '../render/classify';
import { applyNames, EMPTY_CATALOG, type CatalogIndex, type CatalogNames, isEditable, STATUS_LABEL, search, statusOf, type CatalogEntry, type CatalogKind, type EditorCatalog, type Status } from './catalog';
import { esc, measureHtml, readForm, renderInspector } from './inspector';
import { editedObjects, emptyDoc, readEdit, removeEdit, writeEdit, type Edit, type EditKind, type OverrideDoc } from './overrides';
import { Stage, type Measure, type View } from './stage';
import { buildModelSubject, buildSubject, buildVoxSubject, type Subject } from './subject';
import { ThumbnailCache } from './thumbs';
import { branchOf, buildTree, inBranch, KIND_NAME, KINDS, pathOf, trail, type Kind, type TreeNode } from './tree';
import { lang, LANGS, setLang, t, type Lang } from './i18n';

type Tab = Kind;
const FILTERS: (Status | 'all')[] = ['all', 'voxel', 'fallback', 'base', 'texture', 'procedural', 'none', 'hidden', 'override'];
const LIST_LIMIT = 400;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

// ── Registry: base documents + the override document ────────────────────────────────────
async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    return res.ok && res.headers.get('content-type')?.includes('json') ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

const baseDocs = (await Promise.all(['/data/appearance.json', ...LOCAL_PACKS.filter((u) => u !== LOCAL_OVERRIDES)].map((u) => fetchJson<AppearanceDoc>(u)))).filter((d): d is AppearanceDoc => Boolean(d));
const apiAvailable = Boolean(await fetchJson('/api/editor/overrides'));
let saved: OverrideDoc = { ...emptyDoc(), ...((apiAvailable ? await fetchJson<OverrideDoc>('/api/editor/overrides') : await fetchJson<OverrideDoc>(LOCAL_OVERRIDES)) ?? {}) };
let draft: OverrideDoc = saved;

function makeAppearance(doc: OverrideDoc): Appearance {
  const a = new Appearance();
  for (const d of baseDocs) a.merge(d);
  a.merge(doc as AppearanceDoc);
  return a;
}

let appearance = makeAppearance(saved);
// Voxel sets (dev server: vendor/voxel/*). With any, sizes follow cataclysm-3d's voxel world
// unless ?world= says otherwise (metric / compact).
const voxelSets = await loadVoxelSets();
const worldParam = new URLSearchParams(location.search).get('world');
if (worldParam === 'voxel' || (!worldParam && voxelSets.length)) useVoxelWorld(voxelSets[0]?.set.voxels_per_tile ?? 8);
else useMetricWorld(worldParam === 'metric');
const voxItems = new Map(libraryItems(voxelSets).map((i) => [i.key, i]));
const textures = new TextureLibrary(appearance.textures);
const models = new ModelLibrary(appearance);
// The CDDA object catalog: pre-built per CDDA version (tools/editor/catalog.mjs --write).
const catalogIndex = await fetchJson<CatalogIndex>('/data/cdda/index.json');
const catalogVersion = catalogIndex?.versions.find((v) => v.id === new URLSearchParams(location.search).get('cdda')) ?? catalogIndex?.versions[0];
const catalog: EditorCatalog = { ...EMPTY_CATALOG, ...((catalogVersion && (await fetchJson<EditorCatalog>(`/data/cdda/${catalogVersion.path}`))) ?? {}) };
// Object names in the interface language (English needs no file).
const namesPath = lang === 'en' ? undefined : catalogVersion?.langs?.[lang]?.path;
applyNames(catalog, namesPath ? await fetchJson<CatalogNames>(`/data/cdda/${namesPath}`) : null);
// Voxel models for CDDA objects: id → looks_like → built-in type (the table of built-in types
// is generated per CDDA version by tools/classify/builtin-kinds.mjs).
const builtinKinds = catalogVersion && voxelSets.length ? await fetchJson<BuiltinKinds>(`/data/cdda/${catalogVersion.id}/builtin-kinds.json`) : null;
const matcher = new VoxMatcher(voxelSets, catalog, builtinKinds, voxItems);
/** The voxel model a CDDA object gets from the loaded sets (null for other tabs or none). */
const voxMatch = (kind: Tab, id: string, v = 0) => (kind === 'model' || kind === 'vox' || !matcher.active ? null : matcher.find(kind, id, v));

// Static texts, the language picker and the page language.
document.documentElement.lang = lang === 'zh_CN' ? 'zh' : lang;
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) el.textContent = t(el.dataset.i18n!);
for (const el of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle!);
for (const el of document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder!);
document.title = t('CDDA 模型工作室');
const langSelect = $<HTMLSelectElement>('#ed-lang');
langSelect.innerHTML = LANGS.map(([l, label]) => `<option value="${l}" ${l === lang ? 'selected' : ''}>${label}</option>`).join('');
langSelect.addEventListener('change', () => setLang(langSelect.value as Lang));
const ctx = { get appearance() { return appearance; }, models, textures };
const stage = new Stage($<HTMLCanvasElement>('#ed-canvas'), appearance, models, textures);

$('#ed-world').textContent = t('墙高 {wall} 格 · 人高 {person} 格', { wall: WORLD.wallHeight, person: WORLD.personHeight });
$('#ed-pack').textContent = t('基础素材 · {n} 个模型', { n: appearance.modelCount });
$('#ed-cdda').textContent = catalogVersion ? `CDDA ${catalogVersion.cdda}` : t('未找到 CDDA 对象表');

// ── State ───────────────────────────────────────────────────────────────────────────────
const params = new URLSearchParams(location.search);
const KIND_IDS = KINDS.map(([k]) => k);
const urlKind = KIND_IDS.includes(params.get('kind') as Tab) ? (params.get('kind') as Tab) : null;
let query = params.get('q') ?? '';
let filter: Status | 'all' = 'all';
let selected: { kind: Tab; id: string } | null = urlKind && params.get('id') ? { kind: urlKind, id: params.get('id')! } : null;
let variant = 0;
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

function modelEntries(): CatalogEntry[] {
  return appearance.modelKeys().filter((k) => !k.startsWith('edit:')).sort().map((key) => {
    const url = appearance.model(key)?.url ?? '';
    return { id: key, name: key, en: url.replace(/^.*\//, ''), sym: '◆', color: 'light_gray', flags: [] };
  });
}

const models0 = modelEntries();
const vox0: CatalogEntry[] = [...voxItems.values()].map((i) => ({
  id: i.key, name: i.file.replace(/^.*\//, '').replace(/\.vox$/i, ''), en: i.entries.map(entryLabel).join(' · '), sym: '▣', color: 'light_gray', flags: [],
  cat: builtinGroup(i.entries[0]?.builtin), voxSet: i.set.id, voxSetName: i.set.set.name,
}));
const entriesOf = (t: Tab): CatalogEntry[] => (t === 'model' ? models0 : t === 'vox' ? vox0 : catalog[t]);

// ── Object tree: every kind split into branches ─────────────────────────────────────────
const branchSegs = (kind: Tab, e: CatalogEntry) => branchOf(kind, e, catalog.labels, kind === 'model' ? appearance.model(e.id) : undefined);
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

function status(t: Tab, e: CatalogEntry): Status {
  const key = `${t}:${e.id}`;
  let s = statusCache.get(key);
  if (!s) {
    if (t === 'model') {
      const m = appearance.model(e.id);
      s = m?.fallback ? 'fallback' : 'base';
    } else if (t === 'vox') {
      s = 'base';
    } else if (voxMatch(t, e.id)) {
      s = 'voxel';
    } else {
      s = statusOf(t as CatalogKind, e, appearance);
    }
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
  const edited = editedObjects(draft);
  const mixed = branch === ALL;
  const grid = layout === 'grid';
  const list = $('#ed-list');
  list.className = grid ? `ed-list grid cell-${cellSize}` : 'ed-list';
  list.innerHTML =
    shown.slice(0, LIST_LIMIT).map(({ kind, e }) => {
      const st = status(kind, e);
      const sel = selected?.kind === kind && selected.id === e.id;
      const mark = edited.has(`${kind}:${e.id}`) ? ' ✎' : '';
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

function currentEdit(kind: EditKind, entry: CatalogEntry): Edit {
  const savedEdit = readEdit(draft, kind, entry.id);
  if (savedEdit) return savedEdit;
  const why = appearance.explain(kind, entry);
  // A placeholder creature has no model key: choosing one replaces it.
  const planned = kind === 'monster' && subject?.plan && subject.plan.kind !== 'model';
  const model = planned ? '' : (subject?.model ?? why.resolved?.model.split('|')[0] ?? '');
  return { model, scale: why.resolved?.scale ?? 1, rotY: 0, y: 0, lieFlat: Boolean(appearance.model(model)?.lieFlat), tint: Boolean(why.resolved?.tint) };
}

function usesOf(key: string): { kind: EditKind; id: string; name: string }[] {
  const out: { kind: EditKind; id: string; name: string }[] = [];
  for (const kind of ['ter', 'furn', 'item', 'vehicle', 'monster'] as const) {
    for (const e of catalog[kind]) {
      const r = appearance.resolve(kind, e);
      if (r && r.model.split('|').includes(key)) out.push({ kind, id: e.id, name: e.name });
    }
  }
  return out;
}

/** How an object is shown: its voxel model when a set has one, else the appearance rules. */
function buildFor(kind: Tab, entry: CatalogEntry, v: number): Promise<Subject> {
  if (kind === 'model') return buildModelSubject(ctx, entry.id);
  if (kind === 'vox') return buildVoxSubject(voxItems.get(entry.id)!);
  const m = voxMatch(kind, entry.id, v);
  if (m) return buildVoxSubject(m.item, m, m.entry.tint ? colorOf(entry.color) : undefined);
  return buildSubject(ctx, kind as CatalogKind, entry, v);
}

/** Rebuild the shown object (after a selection, variant or edit change). */
async function show(keepForm = false): Promise<void> {
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
  const built = await buildFor(sel.kind, entry, variant);
  if (token !== loadToken) return;
  $('#ed-loading').hidden = true;
  subject = built;
  measure = stage.show(built.object, built.actor, built.rootScale);
  // Skinned characters get their pose on the first animation frame: measure again then.
  if (built.actor) setTimeout(() => token === loadToken && (measure = stage.measure(), $('#ed-measure').innerHTML = measureHtml(measure)), 120);
  if (!keepForm) stage.view(view);
  $('#ed-measure').innerHTML = measureHtml(measure);
  renderToolbar();
  const kind = sel.kind;
  const editable = isEditable(kind);
  renderInspector($('#ed-inspector'), appearance, {
    kind,
    branch: branchLabel(objectPath(kind, entry)),
    entry,
    status: status(kind, entry),
    why: editable ? appearance.explain(kind, entry) : null,
    subject: built,
    edit: editable ? currentEdit(kind, entry) : null,
    hasSaved: editable && Boolean(readEdit(saved, kind, entry.id)),
    dirty: JSON.stringify(draft) !== JSON.stringify(saved),
    uses: kind === 'model' ? usesOf(sel.id) : undefined,
    voxel: Boolean(voxMatch(kind, entry.id, variant)),
  }, keepForm);
  updateSavedBadge();
}

function select(kind: Tab, id: string): void {
  const entry = entriesOf(kind).find((e) => e.id === id);
  if (entry && branch !== ALL && !inBranch(objectPath(kind, entry), branch)) {
    branch = kind;
    filter = 'all';
    revealBranch();
    renderTree();
  }
  if (selected?.id !== id || selected.kind !== kind) variant = 0;
  selected = { kind, id };
  const url = new URL(location.href);
  url.searchParams.set('kind', kind);
  url.searchParams.set('id', id);
  history.replaceState(null, '', url);
  renderList();
  void show();
}

// ── Toolbar ─────────────────────────────────────────────────────────────────────────────
const VIEWS: [View, string][] = [['iso', t('斜视')], ['front', t('正面')], ['side', t('侧面')], ['top', t('俯视')]];
const TOGGLES: [keyof Stage['options'], string][] = [['grid', t('网格')], ['wall', t('参照墙')], ['person', t('参照人')], ['bbox', t('包围盒')], ['wireframe', t('线框')]];
const ANIMS: [ClipRole, string][] = [['idle', t('待机')], ['walk', t('行走')], ['attack', t('攻击')], ['hit', t('受击')], ['die', t('死亡')]];

function renderToolbar(): void {
  $('#ed-views').innerHTML = `<label>${t('视角')}</label>${VIEWS.map(([v, l]) => `<button type="button" data-view="${v}" class="${v === view ? 'on' : ''}">${l}</button>`).join('')}`;
  $('#ed-toggles').innerHTML = TOGGLES.map(([k, l]) => `<button type="button" data-toggle="${k}" class="${stage.options[k] ? 'on' : ''}">${l}</button>`).join('');
  const variants = subject?.variants.length ?? 0;
  const monster = selected?.kind === 'monster';
  const vbox = $('#ed-variants');
  vbox.hidden = !(variants > 1);
  vbox.innerHTML = `<label>${t('变体')}</label><button type="button" data-variant="-1">‹</button><span class="mono" style="padding:0 4px">${monster ? `#${variant}` : `${(variant % Math.max(1, variants)) + 1}/${variants}`}</span><button type="button" data-variant="1">›</button>`;
  const abox = $('#ed-anims');
  abox.hidden = !subject?.actor;
  abox.innerHTML = `<label>${t('动画')}</label>${ANIMS.map(([r, l]) => `<button type="button" data-anim="${r}">${l}</button>`).join('')}`;
}

// ── Editing ─────────────────────────────────────────────────────────────────────────────
let previewTimer: ReturnType<typeof setTimeout> | undefined;

function setDraft(doc: OverrideDoc, keepForm: boolean): Promise<void> {
  draft = doc;
  appearance = makeAppearance(draft);
  models.use(appearance);
  statusCache.clear();
  thumbs.clear();
  renderList();
  return show(keepForm);
}

function preview(): Promise<void> {
  if (!selected || !isEditable(selected.kind)) return Promise.resolve();
  const kind = selected.kind;
  const edit = readForm($('#ed-inspector'));
  if (!edit.model || !appearance.model(edit.model)) {
    $('#ed-saved').textContent = edit.model ? t('没有模型键 {key}', { key: edit.model }) : t('请选择模型');
    $('#ed-saved').className = 'ed-saved error';
    return Promise.resolve();
  }
  return setDraft(writeEdit(draft, kind, selected.id, edit, makeAppearance(removeEdit(draft, kind, selected.id)).model(edit.model)), true);
}

async function save(): Promise<void> {
  if (!apiAvailable) {
    $('#ed-saved').textContent = t('保存需要开发服务器（npm run dev）');
    $('#ed-saved').className = 'ed-saved error';
    return;
  }
  const res = await fetch('/api/editor/overrides', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
  const body = (await res.json()) as OverrideDoc & { error?: string };
  if (!res.ok) {
    $('#ed-saved').textContent = t('保存失败：{error}', { error: body.error ?? '' });
    $('#ed-saved').className = 'ed-saved error';
    return;
  }
  saved = body;
  await setDraft(saved, false);
}

function updateSavedBadge(): void {
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const n = editedObjects(saved).size;
  $('#ed-saved').textContent = dirty ? t('有未保存的修改') : t('本地覆盖 {n} 项', { n }) + (apiAvailable ? '' : t('（只读）'));
  $('#ed-saved').className = `ed-saved${dirty ? ' dirty' : ''}`;
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
  } else if (b.dataset.anim) {
    stage.animated?.play(b.dataset.anim as ClipRole, b.dataset.anim !== 'idle' && b.dataset.anim !== 'walk');
  }
});

const inspector = $('#ed-inspector');
inspector.addEventListener('input', (e) => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'f-scale-range') inspector.querySelector<HTMLInputElement>('#f-scale')!.value = Math.exp(Number(t.value)).toFixed(3);
  if (t.id === 'f-scale') inspector.querySelector<HTMLInputElement>('#f-scale-range')!.value = String(Math.log(Number(t.value) || 1));
  if (t.id === 'f-height') return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => void preview(), t.id === 'f-model' ? 350 : 120);
});
inspector.addEventListener('change', (e) => {
  if ((e.target as HTMLElement).matches('select, input[type=checkbox]')) void preview();
});
inspector.addEventListener('click', (e) => {
  const t = e.target as HTMLElement;
  const link = t.closest<HTMLElement>('a[data-kind]');
  if (link) return select(link.dataset.kind as EditKind, link.dataset.id!);
  if (t.id === 'f-save') void save();
  if (t.id === 'f-revert') void setDraft(saved, false);
  if (t.id === 'f-reset' && selected && isEditable(selected.kind)) void setDraft(removeEdit(draft, selected.kind, selected.id), false);
  if (t.id === 'f-fit' && measure) {
    // Target height in metres → scale factor relative to the size shown now.
    const metres = Number(inspector.querySelector<HTMLInputElement>('#f-height')!.value);
    const scaleInput = inspector.querySelector<HTMLInputElement>('#f-scale')!;
    if (metres > 0 && measure.height > 0) {
      const current = Number(scaleInput.value) || 1;
      scaleInput.value = ((current * metres) / (measure.height * (1.8 / WORLD.personHeight))).toFixed(3);
      scaleInput.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
});
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 's') {
    e.preventDefault();
    void save();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (JSON.stringify(draft) !== JSON.stringify(saved)) e.preventDefault();
});

// Model-key suggestions for the edit form.
const keys = document.createElement('datalist');
keys.id = 'ed-model-keys';
keys.innerHTML = appearance.modelKeys().filter((k) => !k.startsWith('edit:')).map((k) => `<option value="${esc(k)}"></option>`).join('');
document.body.appendChild(keys);

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
    get subject() { return subject && { source: subject.source, model: subject.model, variants: subject.variants, notes: subject.notes }; },
    get status() { return selected && selected.kind !== 'model' ? status(selected.kind, entryOf(selected)!) : null; },
    get branch() { return branch; },
    get layout() { return { layout, cellSize }; },
    setLayout: (l: Layout, size?: CellSize) => setLayout(l, size),
    tree: () => tree,
    setBranch: (path: string) => setBranch(path),
    get world() { return { ...WORLD }; },
    catalogSizes: Object.fromEntries(KIND_IDS.map((k) => [k, entriesOf(k).length])),
    select: (kind: Tab, id: string) => select(kind, id),
    draft: () => draft,
    saved: () => saved,
  },
});
