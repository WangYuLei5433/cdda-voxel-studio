// What the stage shows for one object: its voxel model when a voxel set has one, its mesh
// model when a mesh set has one, else an abstract box sized from the object's CDDA data
// (1 tile = 1 m, cataclysm-3d's scale).
import * as THREE from 'three';

import { buildMesh, fileUrl, type BuiltMesh, type LoadedMeshSet, type MeshItem, type Placement } from '../mesh/library';
import { assembleInterior, type LayoutPart, type VehicleInterior, type VehicleParts } from '../mesh/vehicle';
import { isMeshFile, MESH_ROLES, missingClips, sizeFields, type MeshEntry } from '../mesh/meshset';
import { colorOf, terrainKind } from '../render/classify';
import { WORLD } from '../render/world-scale';
import { buildVox, entryLabel, type VoxItem } from '../vox/library';
import type { Match, VoxMatch } from '../vox/match';
import type { CatalogEntry, CatalogKind } from './catalog';
import { listSep, t } from './i18n';

export interface Subject {
  object: THREE.Object3D;
  /** How it is drawn, in words. */
  source: string;
  /** Sizes, bindings and problems. */
  notes: string[];
  /** File variants the entry offers (the variant buttons step through them). */
  variants: string[];
  /** Animation clips the model can play, as [label, clip name]. */
  clips?: [string, string][];
  /** The clip playing now (null: the model's rest pose). */
  playing?: string | null;
  play?(clip: string | null): void;
  /** Advance the animation by `dt` seconds (the stage calls it every frame). */
  update?(dt: number): void;
}

export type MeshMatch = Match<LoadedMeshSet, MeshItem, MeshEntry>;

const fmt = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : '—');

/** A voxel model as `match` (or the item's first entry) places it, with its size and checks. */
export async function buildVoxSubject(item: VoxItem, match?: VoxMatch, tint?: number): Promise<Subject> {
  if (isMeshFile(item.file)) return buildVoxObjSubject(item, match, tint);
  const { object, model, problems } = await buildVox(item, match?.entry, tint);
  const [x, y, z] = model.size;
  const notes = [
    ...(match ? [t('体素素材集 {set}：{how}', { set: match.set.set.name, how: howMatched(match) })] : []),
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

/** How a set entry was found for the object, in words. */
const howMatched = (m: { via: string; matched: string }): string => (m.via === 'id' ? t('按 id 匹配') : m.via === 'looks_like' ? t('按 looks_like 匹配：{id}', { id: m.matched }) : t('按原型匹配：{type}', { type: m.matched }));

/** Size and model statistics of a placed mesh. */
function meshNotes(built: BuiltMesh): string[] {
  const [x, y, z] = built.size.map((n) => n * built.scale);
  const { triangles, textures, clips } = built.loaded;
  return [
    t('{w} × {d} × {h} 格（宽 × 深 × 高），缩放 {s}', { w: fmt(x), d: fmt(z), h: fmt(y), s: fmt(built.scale, 3) }),
    t('{t} 个三角形 · {n} 张贴图', { t: triangles, n: textures }),
    ...(clips.length ? [t('动画：{names}', { names: clips.map((c) => c.name).join(listSep()) })] : []),
    ...(!triangles ? [t('模型是空的')] : []),
    ...(Math.max(x, y, z) > MESH_LARGE ? [t('超过 {n} 格大：检查缩放（1 个模型单位 = 1 格 = 1 米）', { n: MESH_LARGE })] : []),
    ...(triangles > MESH_HEAVY ? [t('三角形超过 {n} 个：游戏里同屏多个时会很重', { n: MESH_HEAVY })] : []),
  ];
}
const MESH_LARGE = 4;
const MESH_HEAVY = 100_000;

/**
 * Clip controls for a placed mesh: the entry's states first ("idle · Run"), then the file's other
 * clips. Plays `idle` when the entry names one. Stopping puts every node back to its rest pose.
 */
/** The looping effects clip (drips, puffs, pulses on fx_ nodes, independent of the rig). */
export const FX_CLIP = 'FX';

function animate(subject: Subject, built: BuiltMesh, roles: MeshEntry['animations']): Subject {
  const mixer = built.mixer;
  if (!mixer) return subject;
  // Effects always loop, under whatever body animation plays; they are not a clip to pick.
  const fxClip = built.loaded.clips.find((c) => c.name === FX_CLIP);
  const fxAction = fxClip ? mixer.clipAction(fxClip) : null;
  fxAction?.play();
  const clips = built.loaded.clips.filter((c) => c !== fxClip);
  const named = MESH_ROLES.filter((r) => roles?.[r] && clips.some((c) => c.name === roles[r])).map((r): [string, string] => [`${r} · ${roles![r]}`, roles![r]!]);
  const rest = clips.filter((c) => !named.some(([, n]) => n === c.name)).map((c): [string, string] => [c.name, c.name]);
  const model = built.object.children[0];
  const pose: [THREE.Object3D, THREE.Vector3, THREE.Quaternion, THREE.Vector3][] = [];
  // Rest pose of the rig (the fx_ nodes keep their own animation).
  model.traverse((o) => { if (o !== model && !o.name.startsWith('fx_')) pose.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]); });
  const out: Subject = {
    ...subject,
    clips: [...named, ...rest],
    playing: null,
    play(clip) {
      for (const c of clips) mixer.existingAction(c)?.stop();
      for (const [o, p, q, s] of pose) {
        o.position.copy(p);
        o.quaternion.copy(q);
        o.scale.copy(s);
      }
      out.playing = null;
      const c = clip ? clips.find((x) => x.name === clip) : undefined;
      if (!c) return;
      const action = mixer.clipAction(c);
      if (roles?.death === c.name) {
        action.setLoop(THREE.LoopOnce, 1);
        action.clampWhenFinished = true;
      }
      action.reset().play();
      out.playing = c.name;
    },
    update: (dt) => mixer.update(dt),
  };
  if (fxClip) out.notes = [...out.notes, t('特效：循环播放（独立于骨骼，{n} 个特效节点）', { n: new Set(fxClip.tracks.map((tr) => tr.name.split('.')[0])).size })];
  if (roles?.idle) out.play!(roles.idle);
  return out;
}

/** A mesh model as `match` (or the item's first entry) places it, with its size and checks. */
export async function buildMeshSubject(item: MeshItem, match?: MeshMatch, tint?: number, size?: Partial<MeshEntry>): Promise<Subject> {
  // `size`: a placement tried instead of the entry's own (Try on), e.g. { height: 1.75 }.
  const own = match?.entry ?? item.entries[0] ?? {};
  const entry: MeshEntry = size ? { ...own, scale: undefined, fit: undefined, height: undefined, ...size } : own;
  const built = await buildMesh(fileUrl(item.set.base, item.file), entry, { ...(tint !== undefined ? { tint } : {}), emissive: Boolean(entry.emissive) });
  const missing = missingClips(entry, built.loaded.clips.map((c) => c.name));
  const fields = sizeFields(entry);
  const notes = [
    ...(match ? [t('网格素材集 {set}：{how}', { set: match.set.set.name, how: howMatched(match) })] : []),
    ...(tint !== undefined ? [t('按 CDDA 颜色染色')] : []),
    ...meshNotes(built),
    ...item.entries.map((e) => t('绑定：{what}', { what: entryLabel(e) })),
    ...(missing.length ? [t('文件里没有这些动画：{names}', { names: missing.join(listSep()) })] : []),
    ...(fields.length > 1 ? [t('同时设置了 {fields}，只用 {used}', { fields: fields.join(listSep()), used: fields[0] })] : []),
  ];
  const files = entry.files?.length ? entry.files : [];
  return animate({ object: built.object, source: `${item.set.id}/${item.file}`, notes, variants: files }, built, entry.animations);
}

/** A mesh set with vehicle cabin parts, and its placement rules. */
export interface Assembler {
  set: LoadedMeshSet;
  vp: VehicleParts;
}

/** Put a vehicle's cabin parts (seats, controls, dashboard…) inside a whole-vehicle model. */
export async function addInterior(subject: Subject, a: Assembler, layout: LayoutPart[], interior: VehicleInterior): Promise<Subject> {
  const { object, placed } = await assembleInterior(a.set, a.vp, layout, interior);
  if (!placed) return subject;
  subject.object.add(object);
  return { ...subject, notes: [...subject.notes, t('车内：按 CDDA 的部件布局放了 {n} 个内饰部件（{set}）', { n: placed, set: a.set.set.name })] };
}

/**
 * A voxel set's .obj entry: shown as the mesh itself. cataclysm-3d voxelizes it when it loads,
 * one OBJ unit per tile, `mesh_height` (voxels) or `mesh_scale` changing that.
 */
async function buildVoxObjSubject(item: VoxItem, match?: VoxMatch, tint?: number): Promise<Subject> {
  const vpt = item.set.set.voxels_per_tile;
  const e = match?.entry ?? item.entries[0] ?? {};
  const placement: Placement = {
    ...(typeof e.mesh_height === 'number' && e.mesh_height > 0 ? { height: e.mesh_height / vpt } : {}),
    ...(typeof e.mesh_scale === 'number' && e.mesh_scale > 0 ? { scale: e.mesh_scale } : {}),
    ...(Array.isArray(e.offset) ? { offset: e.offset.map((n) => n / vpt) as [number, number, number] } : {}),
  };
  const built = await buildMesh(fileUrl(item.set.base, item.file), placement, { ...(tint !== undefined ? { tint } : {}), emissive: Boolean(e.emissive) });
  if (typeof e.scale === 'number' && e.scale > 0) built.object.scale.setScalar(e.scale);
  const notes = [
    ...(match ? [t('体素素材集 {set}：{how}', { set: match.set.set.name, how: howMatched(match) })] : []),
    t('OBJ 网格：cataclysm-3d 加载时会把它体素化（每格 {n} 体素），这里显示原始网格', { n: vpt }),
    ...meshNotes(built),
    ...item.entries.map((x) => t('绑定：{what}', { what: entryLabel(x) })),
  ];
  const files = e.files?.length ? e.files : [];
  return { object: built.object, source: `${item.set.id}/${item.file}`, notes, variants: files };
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
    source: t('没有模型：占位长方体'),
    notes: [basis, t('{w} × {d} × {h} 格（宽 × 深 × 高）', { w: fmt(w), d: fmt(d), h: fmt(h) })],
    variants: [],
  };
}
