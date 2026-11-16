// What the stage shows for one object: its voxel model when a voxel set has one, else an
// abstract box sized from the object's CDDA data (1 tile = 1 m, cataclysm-3d's scale).
import * as THREE from 'three';

import { colorOf, terrainKind } from '../render/classify';
import { WORLD } from '../render/world-scale';
import { buildVox, entryLabel, type VoxItem } from '../vox/library';
import type { VoxMatch } from '../vox/match';
import type { CatalogEntry, CatalogKind } from './catalog';
import { t } from './i18n';

export interface Subject {
  object: THREE.Object3D;
  /** How it is drawn, in words. */
  source: string;
  /** Sizes, bindings and problems. */
  notes: string[];
  /** File variants the voxel entry offers (the variant buttons step through them). */
  variants: string[];
}

const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '—');

/** A voxel model as `match` (or the item's first entry) places it, with its size and checks. */
export async function buildVoxSubject(item: VoxItem, match?: VoxMatch, tint?: number): Promise<Subject> {
  const { object, model, problems } = await buildVox(item, match?.entry, tint);
  const [x, y, z] = model.size;
  const how = match && (match.via === 'id' ? t('按 id 匹配') : match.via === 'looks_like' ? t('按 looks_like 匹配：{id}', { id: match.matched }) : t('按原型匹配：{type}', { type: match.matched }));
  const notes = [
    ...(match ? [t('体素素材集 {set}：{how}', { set: match.set.set.name, how: how! })] : []),
    ...(tint !== undefined ? [t('按 CDDA 颜色染色')] : []),
    t('{x} × {y} × {z} 体素（宽 × 深 × 高），{n} 个体素', { x, y, z, n: model.voxels.length / 4 }),
    ...item.entries.map((e) => t('绑定：{what}', { what: entryLabel(e) })),
    ...(model.modelCount > 1 ? [t('文件里有 {n} 个模型，cataclysm-3d 只用第一个', { n: model.modelCount })] : []),
    ...problems.map((p) => VOX_PROBLEM[p] ?? p),
  ];
  const entry = match?.entry ?? item.entries[0];
  const files = entry?.files?.length ? entry.files : [];
  return { object, source: `${item.set.id}/${item.file}`, notes, variants: files };
}

const VOX_PROBLEM: Record<string, string> = {
  size: t('超过 256 体素的尺寸上限'),
  floating: t('最底层是空的：模型会悬在地面上方'),
  'odd-width': t('宽或深与每格体素数的奇偶不同：无法正好居中'),
  empty: t('模型是空的'),
};

/** Size of the stand-in box, in tiles (x across, y up, z along), and how it was worked out. */
export function placeholderSize(kind: CatalogKind, e: CatalogEntry): { size: [number, number, number]; basis: string } {
  switch (kind) {
    case 'item': {
      // Longest side lying along x; the rest of the volume as a square cross-section.
      const length = (e.longestSide ?? 100) / 1000;
      const volume = (e.volume ?? 250) / 1e6;
      const side = Math.min(length, Math.max(0.005, Math.sqrt(volume / Math.max(length, 0.001))));
      return { size: [length, side, side], basis: t('按最长边 {l} cm、体积 {v} L 估算', { l: fmt(length * 100, 1), v: fmt(volume * 1000, 2) }) };
    }
    case 'monster': {
      // A body of the creature's volume: upright for humanoids, long for the rest.
      const volume = (e.volume ?? [0, 3750, 30000, 62500, 300000, 1000000][e.size ?? 3]) / 1e6;
      const s = Math.cbrt(volume);
      const upright = e.body === 'human' || ((e.species ?? []).some((x) => ['HUMAN', 'ZOMBIE', 'FERAL', 'CYBORG'].includes(x)) && !e.body);
      return { size: upright ? [1.1 * s, 4.4 * s, 0.6 * s] : [0.8 * s, s, 1.6 * s], basis: t('按体积 {v} L 估算（{shape}）', { v: fmt(volume * 1000, 1), shape: upright ? t('直立') : t('横卧') }) };
    }
    case 'ter': {
      const k = terrainKind({ id: e.id, name: e.name, sym: e.sym, color: e.color, move: e.move ?? 2, looksLike: e.looksLike ?? '', flags: e.flags });
      const full = k === 'wall' || k === 'door' || k === 'window';
      return full ? { size: [1, WORLD.wallHeight, 1], basis: t('墙、门、窗：一格宽、一层高') } : { size: [1, 0.05, 1], basis: t('地面：一格大小的薄板') };
    }
    case 'furn':
      return { size: [0.9, 0.9, 0.9], basis: t('家具：CDDA 没有尺寸数据，按一格显示') };
    case 'vehicle':
      return { size: [e.width ?? 1, 1.5, e.length ?? 1], basis: t('按车身 {l} × {w} 格', { l: e.length ?? 1, w: e.width ?? 1 }) };
    case 'vpart':
      return { size: [1, 0.5, 1], basis: t('载具部件：一格') };
    case 'field':
      return { size: [1, 0.1, 1], basis: t('场地效果：铺满一格') };
    case 'trap':
      return { size: [0.8, 0.05, 0.8], basis: t('陷阱：地面上的一块') };
  }
}

/** The stand-in: a translucent box in the object's CDDA color, with its edges drawn. */
export function buildPlaceholder(kind: CatalogKind, e: CatalogEntry): Subject {
  const { size, basis } = placeholderSize(kind, e);
  const [w, h, d] = size;
  const geometry = new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0);
  const color = colorOf(e.color);
  const box = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, transparent: true, opacity: 0.55, roughness: 0.9, depthWrite: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry), new THREE.LineBasicMaterial({ color }));
  const group = new THREE.Group();
  group.add(box, edges);
  return {
    object: group,
    source: t('没有体素模型：占位长方体'),
    notes: [basis, t('{w} × {d} × {h} 格（宽 × 深 × 高）', { w: fmt(w), d: fmt(d), h: fmt(h) })],
    variants: [],
  };
}
