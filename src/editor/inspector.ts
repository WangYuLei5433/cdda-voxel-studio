// The editor's right-hand panel: what the object is, how the game draws it (and why), its
// in-game size, and the edit form. Plain DOM; main.ts owns the state.
import type { Appearance, Explanation } from '../render/appearance';
import { WORLD } from '../render/world-scale';
import { KIND_LABEL, STATUS_LABEL, type CatalogEntry, type CatalogKind, type Status } from './catalog';
import type { Edit, EditKind } from './overrides';
import type { Measure } from './stage';
import type { Subject } from './subject';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Metres per tile: the game's person height stands for 1.8 m. */
export const metresPerTile = () => 1.8 / WORLD.personHeight;

const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '—');

const SIZE_NAMES = ['', '极小', '小', '中', '大', '巨大'];

const VIA_LABEL: Record<Explanation['via'], string> = {
  override: '本地覆盖（编辑器保存）',
  exact: '精确 id 条目',
  rule: '外观规则',
  none: '无匹配',
};

function identity(kind: CatalogKind | 'model', e: CatalogEntry, branch: string): string {
  const rows: [string, string][] = [['id', `<span class="mono">${esc(e.id)}</span>`]];
  if (kind !== 'model') rows.push(['类别', KIND_LABEL[kind]]);
  if (branch) rows.push(['分支', esc(branch)]);
  if (e.cat) rows.push([kind === 'vpart' ? '部件分类' : '物品分类', `<span class="mono">${esc(e.cat)}</span>`]);
  if (e.location) rows.push(['安装位置', `<span class="mono">${esc(e.location)}</span>`]);
  if (e.covers?.length) rows.push(['覆盖部位', esc(e.covers.join(', '))]);
  if (e.species?.length) rows.push(['物种', esc(e.species.join(', '))]);
  if (e.body) rows.push(['体型', esc(e.body)]);
  if (e.size) rows.push(['尺寸等级', `${e.size}（${SIZE_NAMES[e.size] ?? ''}）`]);
  if (e.length) rows.push(['车身', `${e.length} × ${e.width} 格`]);
  if (e.types?.length) rows.push(['物品类型', `<span class="mono">${esc(e.types.join(', '))}</span>`]);
  if (e.volume !== undefined) rows.push(['体积', e.volume >= 1000 ? `${fmt(e.volume / 1000, 2)} L` : `${fmt(e.volume, 0)} ml`]);
  if (e.weight !== undefined) rows.push(['重量', e.weight >= 1000 ? `${fmt(e.weight / 1000, 2)} kg` : `${fmt(e.weight, 1)} g`]);
  if (e.longestSide !== undefined) rows.push(['最长边', `${fmt(e.longestSide / 10, 1)} cm${e.longestSideDefault ? '（按体积估算）' : ''}`]);
  if (e.requiredStr !== undefined) rows.push(['拖动所需力量', String(e.requiredStr)]);
  if (e.variants?.length) rows.push(['变体', esc(e.variants.map((v) => v.name).join('、'))]);
  if (e.file) rows.push(['定义文件', `<span class="mono">data/json/${esc(e.file)}</span>`]);
  if (e.looksLike) rows.push(['looks_like', `<span class="mono">${esc(e.looksLike)}</span>`]);
  if (e.color && kind !== 'model') rows.push(['颜色', `<span class="mono">${esc(e.color)}</span>`]);
  const flags = e.flags?.length ? `<details><summary>标志 ${e.flags.length} 个</summary><div class="chips">${e.flags.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}</div></details>` : '';
  return `<section class="ed-sec"><div class="ed-name">${esc(e.name)}</div>${e.en !== e.name ? `<div class="ed-en">${esc(e.en)}</div>` : ''}
    <dl class="ed-kv" style="margin-top:6px">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>${flags}</section>`;
}

function resolution(appearance: Appearance, status: Status, why: Explanation | null, subject: Subject): string {
  const entry = subject.model ? appearance.model(subject.model) : undefined;
  const rows: [string, string][] = [['显示为', esc(subject.source)]];
  const planned = subject.plan && subject.plan.kind !== 'model' && why?.via !== 'override';
  if (planned) rows.push(['来源', '无模型（生物方案）']);
  else if (why) rows.push(['模型来源', why.via === 'none' ? (why.texture ? '没有模型规则，只用贴图' : '没有模型规则') : VIA_LABEL[why.via] + (why.ruleIndex !== undefined ? `（第 ${why.ruleIndex + 1} 条）` : '')]);
  if (subject.model) rows.push(['模型键', `<span class="mono">${esc(subject.model)}</span>`]);
  if (entry) rows.push(['文件', `<span class="mono">${esc(entry.url.replace(/^.*\/assets\//, ''))}</span>`]);
  if (why?.texture) rows.push(['贴图', `<span class="mono">${esc(why.texture)}</span>`]);
  if (subject.placeScale !== 1) rows.push(['摆放缩放', fmt(subject.placeScale, 3)]);
  const notes = [...subject.notes];
  const json = (label: string, v: unknown) => (v ? `<details><summary>${label}</summary><pre class="ed-json">${esc(JSON.stringify(v, null, 2))}</pre></details>` : '');
  return `<section class="ed-sec"><h3>游戏中的样子</h3>
    <div class="ed-status"><span class="dot st-${status}"></span>${STATUS_LABEL[status]}</div>
    <dl class="ed-kv" style="margin-top:6px">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
    ${notes.length ? `<ul class="ed-notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    ${json(planned ? '外观规则（被生物方案取代）' : '匹配的规则', why?.rule)}${json('模型条目', entry)}${json('贴图规则', why?.textureRule)}</section>`;
}

/** Size readout for the stage overlay. */
export function measureHtml(m: Measure): string {
  const k = metresPerTile();
  if (!m.height && !m.width) return '<span class="sub">没有可测量的模型</span>';
  return `<div class="big">${fmt(m.width)} × ${fmt(m.depth)} × ${fmt(m.height)} 格</div>
    <div class="sub">宽 × 深 × 高 ≈ ${fmt(m.width * k)} × ${fmt(m.depth * k)} × ${fmt(m.height * k)} 米 · 墙高的 ${Math.round((m.height / WORLD.wallHeight) * 100)}% · 人高的 ${Math.round((m.height / WORLD.personHeight) * 100)}%${m.bottom < -0.01 ? ` · <span style="color:var(--warn)">低于地面 ${fmt(-m.bottom)} 格</span>` : ''}</div>`;
}

function editForm(edit: Edit, hasSaved: boolean, dirty: boolean): string {
  return `<section class="ed-sec"><h3>编辑（只影响这一个对象）</h3>
    <form class="ed-form" id="ed-form" autocomplete="off">
      <label for="f-model">模型</label><div class="row"><input id="f-model" name="model" type="text" list="ed-model-keys" value="${esc(edit.model)}" placeholder="模型键，可搜索" class="mono" /></div>
      <label for="f-scale">缩放</label><div class="row"><input id="f-scale-range" type="range" min="-2.3" max="2.3" step="0.01" value="${Math.log(edit.scale)}" /><input id="f-scale" name="scale" type="number" min="0.01" step="0.01" value="${edit.scale}" /></div>
      <label for="f-height">目标高度</label><div class="row"><input id="f-height" type="number" min="0.01" step="0.01" placeholder="米" /><button type="button" id="f-fit">按高度设缩放</button></div>
      <label for="f-rot">转向</label><div class="row"><select id="f-rot" name="rotY">${[0, 90, 180, 270].map((d) => `<option value="${d}" ${edit.rotY === d ? 'selected' : ''}>${d}°</option>`).join('')}${[0, 90, 180, 270].includes(edit.rotY) ? '' : `<option value="${edit.rotY}" selected>${edit.rotY}°</option>`}</select></div>
      <label for="f-y">抬高</label><div class="row"><input id="f-y" name="y" type="number" step="0.01" value="${edit.y}" /><span class="ed-hint" style="margin:0">格</span></div>
      <label>摆放</label><div class="row"><label><input id="f-flat" name="lieFlat" type="checkbox" ${edit.lieFlat ? 'checked' : ''} /> 平放</label><label><input id="f-tint" name="tint" type="checkbox" ${edit.tint ? 'checked' : ''} /> 按 CDDA 颜色染色</label></div>
    </form>
    <div class="ed-actions">
      <button type="button" class="primary" id="f-save" ${dirty ? '' : 'disabled'}>保存</button>
      <button type="button" id="f-revert" ${dirty ? '' : 'disabled'}>放弃修改</button>
      <button type="button" id="f-reset" ${hasSaved ? '' : 'disabled'}>恢复默认</button>
    </div>
    <p class="ed-hint">修改即时预览；保存写入 public/data/appearance.local.json（只在本地，不提交）。</p></section>`;
}

export interface InspectorModel {
  kind: CatalogKind | 'model';
  /** Where it sits in the object tree ("物品 › 服装 › 躯干"). */
  branch: string;
  entry: CatalogEntry;
  status: Status;
  why: Explanation | null;
  subject: Subject;
  edit: Edit | null;
  hasSaved: boolean;
  dirty: boolean;
  /** Model tab: objects that use this model. */
  uses?: { kind: EditKind; id: string; name: string }[];
}

/** Draw the panel; `keepForm` redraws everything but the edit form (live preview while typing). */
export function renderInspector(host: HTMLElement, appearance: Appearance, m: InspectorModel, keepForm = false): void {
  const info = identity(m.kind, m.entry, m.branch) + resolution(appearance, m.status, m.why, m.subject);
  const form = host.querySelector('#ins-edit');
  if (keepForm && form) {
    host.querySelector('#ins-info')!.innerHTML = info;
    for (const [id, off] of [['#f-save', !m.dirty], ['#f-revert', !m.dirty], ['#f-reset', !m.hasSaved]] as const) {
      const b = host.querySelector<HTMLButtonElement>(id);
      if (b) b.disabled = off;
    }
    return;
  }
  const uses = m.uses
    ? `<section class="ed-sec"><h3>使用这个模型的对象（${m.uses.length}）</h3><ul class="ed-uses">${m.uses.slice(0, 300).map((u) => `<li><a data-kind="${u.kind}" data-id="${esc(u.id)}">${KIND_LABEL[u.kind]} · ${esc(u.name)}</a> <span class="mono" style="color:var(--muted)">${esc(u.id)}</span></li>`).join('')}</ul></section>`
    : '';
  const readOnly = !m.edit && m.kind !== 'model'
    ? '<section class="ed-sec"><h3>编辑</h3><p class="ed-hint">游戏不为这一类对象查找模型（见上方说明），这里只能查看。需要给它换模型时，要先让游戏支持这一类。</p></section>'
    : '';
  host.innerHTML = `<div id="ins-info">${info}</div><div id="ins-edit">${m.edit ? editForm(m.edit, m.hasSaved, m.dirty) : readOnly}</div>${uses}`;
}

/** Read the edit form. */
export function readForm(host: HTMLElement): Edit {
  const v = (id: string) => host.querySelector<HTMLInputElement>(`#${id}`)!;
  const scale = Number(v('f-scale').value);
  return {
    model: v('f-model').value.trim(),
    scale: Number.isFinite(scale) && scale > 0 ? Math.round(scale * 1000) / 1000 : 1,
    rotY: Number(host.querySelector<HTMLSelectElement>('#f-rot')!.value) || 0,
    y: Number(v('f-y').value) || 0,
    lieFlat: v('f-flat').checked,
    tint: v('f-tint').checked,
  };
}
