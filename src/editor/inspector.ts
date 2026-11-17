// The studio's right-hand panel: what the object is (its CDDA data), how it is shown (voxel
// model, mesh model or stand-in box) and its size. Plain DOM; main.ts owns the state.
import { VOXELS_PER_TILE, WORLD } from '../render/world-scale';
import { KIND_LABEL, STATUS_LABEL, type CatalogEntry, type CatalogKind, type Status } from './catalog';
import type { Measure } from './stage';
import type { Subject } from './subject';
import { listSep, t } from './i18n';

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '—');

const SIZE_NAMES = ['', t('极小'), t('小'), t('中'), t('大'), t('巨大')];

function identity(kind: CatalogKind | 'vox', e: CatalogEntry, branch: string): string {
  const rows: [string, string][] = [['id', `<span class="mono">${esc(e.id)}</span>`]];
  if (kind !== 'vox') rows.push([t('类别'), KIND_LABEL[kind]]);
  if (branch) rows.push([t('分支'), esc(branch)]);
  if (e.cat && kind !== 'vox') rows.push([kind === 'vpart' ? t('部件分类') : t('物品分类'), `<span class="mono">${esc(e.cat)}</span>`]);
  if (e.location) rows.push([t('安装位置'), `<span class="mono">${esc(e.location)}</span>`]);
  if (e.covers?.length) rows.push([t('覆盖部位'), esc(e.covers.join(', '))]);
  if (e.species?.length) rows.push([t('物种'), esc(e.species.join(', '))]);
  if (e.body) rows.push([t('体型'), esc(e.body)]);
  if (e.size) rows.push([t('尺寸等级'), `${e.size}（${SIZE_NAMES[e.size] ?? ''}）`]);
  if (e.length) rows.push([t('车身'), t('{l} × {w} 格', { l: e.length, w: e.width ?? 1 })]);
  if (e.types?.length) rows.push([t('物品类型'), `<span class="mono">${esc(e.types.join(', '))}</span>`]);
  if (e.volume !== undefined) rows.push([t('体积'), e.volume >= 1000 ? `${fmt(e.volume / 1000, 2)} L` : `${fmt(e.volume, 0)} ml`]);
  if (e.weight !== undefined) rows.push([t('重量'), e.weight >= 1000 ? `${fmt(e.weight / 1000, 2)} kg` : `${fmt(e.weight, 1)} g`]);
  if (e.longestSide !== undefined) rows.push([t('最长边'), `${fmt(e.longestSide / 10, 1)} cm${e.longestSideDefault ? t('（按体积估算）') : ''}`]);
  if (e.requiredStr !== undefined) rows.push([t('拖动所需力量'), String(e.requiredStr)]);
  if (e.variants?.length) rows.push([t('变体'), esc(e.variants.map((v) => v.name).join(listSep()))]);
  if (e.file) rows.push([t('定义文件'), `<span class="mono">data/json/${esc(e.file)}</span>`]);
  if (e.looksLike) rows.push(['looks_like', `<span class="mono">${esc(e.looksLike)}</span>`]);
  if (e.color && kind !== 'vox') rows.push([t('颜色'), `<span class="mono">${esc(e.color)}</span>`]);
  const flags = e.flags?.length ? `<details><summary>${t('标志 {n} 个', { n: e.flags.length })}</summary><div class="chips">${e.flags.map((f) => `<span class="chip">${esc(f)}</span>`).join('')}</div></details>` : '';
  return `<section class="ed-sec"><div class="ed-name">${esc(e.name)}${e.unofficialName ? ` <span class="ed-badge" title="${t('非官方译名')}">*</span>` : ''}</div>${e.en !== e.name ? `<div class="ed-en">${esc(e.en)}</div>` : ''}
    <dl class="ed-kv" style="margin-top:6px">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>${flags}</section>`;
}

function shown(status: Status, subject: Subject): string {
  return `<section class="ed-sec"><h3>${t('模型')}</h3>
    <div class="ed-status"><span class="dot st-${status}"></span>${STATUS_LABEL[status]}</div>
    <dl class="ed-kv" style="margin-top:6px"><dt>${t('显示为')}</dt><dd class="mono">${esc(subject.source)}</dd></dl>
    ${subject.notes.length ? `<ul class="ed-notes">${subject.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</section>`;
}

/** Size readout for the stage overlay: tiles, voxels, and against the wall and the person. */
export function measureHtml(m: Measure): string {
  if (!m.height && !m.width) return `<span class="sub">${t('没有可测量的模型')}</span>`;
  const v = (n: number) => Math.round(n * VOXELS_PER_TILE);
  return `<div class="big">${fmt(m.width)} × ${fmt(m.depth)} × ${fmt(m.height)} ${t('格')}</div>
    <div class="sub">${t('宽 × 深 × 高 ≈ {w} × {d} × {h} 体素 · 墙高的 {wall}% · 人高的 {person}%', { w: v(m.width), d: v(m.depth), h: v(m.height), wall: Math.round((m.height / WORLD.wallHeight) * 100), person: Math.round((m.height / WORLD.personHeight) * 100) })}${m.bottom < -0.01 ? ` · <span style="color:var(--warn)">${t('低于地面 {n} 格', { n: fmt(-m.bottom) })}</span>` : ''}</div>`;
}

export interface InspectorModel {
  kind: CatalogKind | 'vox';
  /** Where it sits in the object tree ("物品 › 服装 › 躯干"). */
  branch: string;
  entry: CatalogEntry;
  status: Status;
  subject: Subject;
}

export function renderInspector(host: HTMLElement, m: InspectorModel): void {
  const hint = m.status === 'voxel'
    ? t('这个模型来自体素素材集。要改它，请在 MagicaVoxel 里修改素材集里的文件；要换成别的模型，请修改 voxelset.json。')
    : m.status === 'mesh'
      ? t('这个模型来自网格素材集。要改它，请在建模软件（如 Blender）里修改文件；要换成别的模型或调整摆放，请修改 meshset.json。cataclysm-3d 不读网格素材集。')
      : m.kind === 'vox' ? '' : t('还没有模型。长方体按 CDDA 数据估算尺寸，只作参照。');
  host.innerHTML = identity(m.kind, m.entry, m.branch) + shown(m.status, m.subject) + (hint ? `<section class="ed-sec"><p class="ed-hint">${hint}</p></section>` : '');
}
