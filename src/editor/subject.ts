// Build one catalog object the way the game draws it (src/render/map-layer.ts for terrain,
// furniture, items and vehicles; src/render/creature-plan.ts for monsters), for the stage.
import * as THREE from 'three';

import type { Appearance, Explanation } from '../render/appearance';
import { colorOf, furnitureKind, terrainKind } from '../render/classify';
import { buildMonster, planMonster, type MonsterPlan } from '../render/creature-plan';
import type { ModelInstance, ModelLibrary } from '../render/models';
import { fieldColor } from '../render/field-color';
import { copyMaterial, type TextureLibrary } from '../render/textures';
import { wallPartGeometry } from '../render/wall-geometry';
import { WORLD } from '../render/world-scale';
import type { CatalogFeature } from '../shared/protocol';
import { isEditable, monsterInfo, type CatalogEntry, type CatalogKind } from './catalog';
import type { EditKind } from './overrides';

export interface Subject {
  object: THREE.Object3D;
  actor: ModelInstance | null;
  rootScale: [number, number, number];
  /** The model key placed (after variant / season / tile choice), if any. */
  model: string | null;
  /** The placement scale the game passes for it (on top of the model's own size). */
  placeScale: number;
  /** Every variant key the resolved rule offers. */
  variants: string[];
  /** How it is drawn, in words. */
  source: string;
  /** Things the game varies or that the stage cannot show exactly. */
  notes: string[];
  plan?: MonsterPlan;
}

export interface Context {
  appearance: Appearance;
  models: ModelLibrary;
  textures: TextureLibrary;
}

const feature = (e: CatalogEntry): CatalogFeature => ({ id: e.id, name: e.name, sym: e.sym, color: e.color, move: e.move ?? 2, looksLike: e.looksLike ?? '', flags: e.flags });

/** A static model as the instanced-prop layer draws it: parts × placement (scale, turn). */
async function staticModel(ctx: Context, key: string, scale: number, tint: number | null): Promise<THREE.Object3D | null> {
  await ctx.models.ensure(key);
  const parts = ctx.models.staticParts(key);
  if (!parts) return null;
  const detail = ctx.appearance.model(key)?.detail;
  const group = new THREE.Group();
  for (const part of parts) {
    let material = detail ? ctx.textures.detail(part.material, detail) : part.material;
    if (tint !== null) {
      material = copyMaterial(material);
      (material as THREE.MeshStandardMaterial).color?.multiply(new THREE.Color(tint));
    }
    const mesh = new THREE.Mesh(part.geometry, material);
    mesh.applyMatrix4(part.matrix);
    group.add(mesh);
  }
  group.scale.setScalar(scale);
  return group;
}

/** A terrain surface: a floor tile, or a three-tile wall run for walls. */
function surface(ctx: Context, texture: string | null, wall: boolean, color: number): THREE.Object3D {
  const textured = texture && ctx.textures.surface(texture);
  const material = textured || new THREE.MeshStandardMaterial({ color, roughness: 1 });
  const wallMaterial = material;
  const group = new THREE.Group();
  if (wall) {
    for (let i = -1; i <= 1; i++) {
      for (const part of ['post', 'armPos', 'armNeg'] as const) {
        const m = new THREE.Mesh(wallPartGeometry(part, WORLD.wallHeight), wallMaterial);
        m.position.x = i;
        group.add(m);
      }
    }
  } else {
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 0.02, 1).translate(0, 0.011, 0), material));
  }
  return group;
}

const std = (opts: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...opts });
const box = (w: number, h: number, d: number, y: number, material: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, y, 0), material);

/** A vehicle part as the map layer draws vehicles without a whole-vehicle model. */
function vehiclePart(entry: CatalogEntry): { object: THREE.Object3D; source: string } {
  const has = (...f: string[]) => f.some((x) => entry.flags.includes(x));
  const metal = (color: number) => std({ color, metalness: 0.3, roughness: 0.6 });
  const floor = (color = 0x5a5f69) => box(0.98, 0.25, 0.98, 0.35, metal(color));
  const g = new THREE.Group();
  let source: string;
  if (has('WHEEL')) {
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 12).rotateZ(Math.PI / 2).translate(0, 0.32, 0), std({ color: 0x1e1e1e }));
    g.add(floor(), wheel);
    source = '车轮：底板 + 轮子';
  } else if (has('WINDSHIELD', 'WINDOW')) {
    const body = box(0.98, 0.7, 0.98, 0.45, metal(0x6a7280));
    body.scale.setScalar(0.7);
    g.add(body, box(0.9, 0.35, 0.9, 0.95, std({ color: 0xbfe6ff, transparent: true, opacity: 0.35, roughness: 0.1 })));
    source = '车窗：车身块 + 玻璃';
  } else if (has('SEAT', 'BED')) {
    g.add(floor(), box(0.6, 0.45, 0.55, 0.7, std({ color: 0x6a3a2a })));
    source = '座椅 / 床：底板 + 座垫';
  } else if (has('OPENABLE', 'DOOR')) {
    g.add(box(0.98, 0.7, 0.98, 0.45, metal(0x7a8a9a)));
    source = '车门：车身块';
  } else if (has('CARGO', 'ENGINE', 'TURRET', 'FUEL_TANK')) {
    g.add(box(0.98, 0.7, 0.98, 0.45, metal(0x8a8f99)));
    source = '货舱 / 引擎 / 炮塔 / 油箱：车身块';
  } else {
    g.add(floor(0x8a8f99));
    source = '其他部件：底板';
  }
  return { object: g, source: `程序方块（${source}）` };
}

/** Build a vehicle part, field or trap: things the map layer draws without a model. */
function buildDrawnOnly(ctx: Context, kind: Exclude<CatalogKind, EditKind>, entry: CatalogEntry, variant: number): Subject {
  const base = { actor: null, rootScale: [1, 1, 1] as [number, number, number], model: null, placeScale: 1 };
  if (kind === 'vpart') {
    const { object, source } = vehiclePart(entry);
    return { ...base, object, variants: [], source, notes: ['游戏不给单个载具部件找模型：整车有模型且不少于 6 格时画整车模型，否则每格按部件标志画方块（车轮、车窗、座椅、车门、货舱…）', `安装位置：${entry.location || '—'}`] };
  }
  if (kind === 'field') {
    // map-layer.ts: a thin tile-sized slab, sized by intensity, textured or coloured.
    const intensity = (variant % 3) + 1;
    const texture = ctx.appearance.textureFor('field', entry);
    const material = (texture && ctx.textures.surface(texture, { transparent: true, opacity: 0.45, side: THREE.DoubleSide })) || std({ color: fieldColor(entry.id), transparent: true, opacity: 0.45, depthWrite: false });
    const slab = box(0.96, 0.04, 0.96, 0, material);
    slab.position.y = 0.03;
    slab.scale.setScalar(0.5 + Math.min(3, intensity) * 0.17);
    const g = new THREE.Group();
    g.add(slab);
    return { ...base, object: g, variants: ['1', '2', '3'], source: texture ? `贴图 ${texture}` : '半透明色块', notes: [`强度 ${intensity}（变体按钮切换 1–3）：游戏按强度把色块放大到 0.67–1.01 格`, `形态：${entry.phase || '—'}`] };
  }
  return { ...base, object: new THREE.Group(), variants: [], source: '不绘制', notes: [entry.hidden ? '隐藏机关：只由脚本触发，CDDA 中也不可见' : '游戏的 3D 画面目前不画陷阱（快照里有陷阱数据，只用于自动寻路避让）'] };
}

/** Variant keys a resolution offers ("a|b|c" → three keys). */
const variantsOf = (why: Explanation) => why.resolved?.model.split('|') ?? [];

/**
 * Build `entry` of `kind` for the stage. `variant` picks among the rule's model variants
 * (the game picks by tile position).
 */
export async function buildSubject(ctx: Context, kind: CatalogKind, entry: CatalogEntry, variant = 0): Promise<Subject> {
  if (!isEditable(kind)) return buildDrawnOnly(ctx, kind, entry, variant);
  const { appearance } = ctx;
  const why = appearance.explain(kind, entry);
  const variants = variantsOf(why);
  const notes: string[] = [];
  if (variants.length > 1) notes.push(`规则有 ${variants.length} 个变体，游戏按格子位置挑选`);

  if (kind === 'monster') {
    const plan = planMonster(monsterInfo(entry), variant, appearance);
    const actor = await buildMonster(plan, ctx.models);
    actor?.play('idle');
    let object = actor?.object ?? null;
    if (!object) {
      // The game's placeholder (src/render/creatures.ts CreatureView).
      const mat = new THREE.MeshStandardMaterial({ color: colorOf(entry.color), roughness: 0.7 });
      object = new THREE.Group();
      const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 4, 10), mat);
      torso.position.y = 0.45;
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), mat);
      skull.position.y = 0.95;
      object.add(torso, skull);
    }
    return { object, actor, rootScale: plan.scale, model: plan.kind === 'model' ? plan.key : null, placeScale: plan.kind === 'model' ? plan.extra : 1, variants, source: plan.source, notes, plan };
  }

  if (kind === 'vehicle') {
    const r = appearance.resolve('vehicle', entry, variant);
    const length = entry.length ?? 1;
    notes.push(`游戏按车身长度缩放：${length} 格 × 0.95；少于 6 格的车按部件绘制`);
    if (!r) return { object: new THREE.Group(), actor: null, rootScale: [1, 1, 1], model: null, placeScale: 1, variants, source: '无整车模型（按部件绘制）', notes };
    const scale = length * 0.95 * r.scale;
    const object = (await staticModel(ctx, r.model, scale, null)) ?? new THREE.Group();
    return { object, actor: null, rootScale: [1, 1, 1], model: r.model, placeScale: scale, variants, source: `模型 ${r.model}`, notes };
  }

  if (kind === 'ter') {
    const tk = terrainKind(feature(entry));
    const r = tk === 'door' || tk === 'door_open' || tk === 'window' ? null : appearance.resolve('ter', entry, variant, undefined, 0);
    const texture = appearance.textureFor('ter', entry, variant);
    if (r) {
      notes.push('游戏中每格随机缩放 80%–100%（此处为 100%）');
      if (/tree|bush|rock/.test(r.model)) notes.push('树木、灌木、岩石在游戏中随机转向');
      const tint = r.tint ? colorOf(entry.color) : null;
      const object = (await staticModel(ctx, r.model, r.scale, tint)) ?? new THREE.Group();
      return { object, actor: null, rootScale: [1, 1, 1], model: r.model, placeScale: r.scale, variants, source: `模型 ${r.model}`, notes };
    }
    if (tk === 'door' || tk === 'door_open' || tk === 'window') notes.push('门和窗由程序生成（门板、门框、窗台），不使用模型');
    const wall = tk === 'wall' || tk === 'door' || tk === 'window';
    return { object: surface(ctx, texture, wall, appearance.colorFor(entry.id) ?? colorOf(entry.color)), actor: null, rootScale: [1, 1, 1], model: null, placeScale: 1, variants, source: texture ? `贴图 ${texture}` : '纯色', notes };
  }

  // Furniture and items (map-layer placeResolved).
  const r = kind === 'furn' ? appearance.resolve('furn', entry, variant, undefined, 0, { x: 0, z: 0, width: 1, depth: 1 }) : appearance.resolve('item', entry, variant);
  if (kind === 'item') notes.push('地上物品在游戏中随机转向，并偏离格子中心 0.18 格');
  if (r) {
    // Furniture tints with the registry colour, ground items with their CDDA colour.
    const tint = r.tint ? (kind === 'furn' ? appearance.colorFor(entry.id) ?? colorOf(entry.color) : colorOf(entry.color)) : null;
    const object = (await staticModel(ctx, r.model, r.scale, tint)) ?? new THREE.Group();
    return { object, actor: null, rootScale: [1, 1, 1], model: r.model, placeScale: r.scale, variants, source: `模型 ${r.model}`, notes };
  }
  // No model: the map layer's block geometry.
  const fk = kind === 'furn' ? furnitureKind(feature(entry)) : 'none';
  const color = appearance.colorFor(entry.id) ?? colorOf(entry.color);
  const object = new THREE.Group();
  if (kind === 'furn' && fk !== 'none') {
    // furnLow / furnBlock batches in map-layer.ts.
    const [w, h] = fk === 'low' ? [0.8, 0.45] : [0.86, 0.95];
    object.add(new THREE.Mesh(new THREE.BoxGeometry(w, h, w).translate(0, h / 2, 0), new THREE.MeshStandardMaterial({ color, roughness: 0.9 })));
    notes.push('无模型：游戏中画为程序方块');
  } else if (kind === 'item') {
    object.add(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.16, 0.22).translate(0, 0.08, 0), new THREE.MeshStandardMaterial({ color, roughness: 0.9 })));
    notes.push('无模型：游戏中画为小方块');
  }
  return { object, actor: null, rootScale: [1, 1, 1], model: null, placeScale: 1, variants, source: '无模型', notes };
}

/** A model-library entry on its own, at the size its entry gives it (placement scale 1). */
export async function buildModelSubject(ctx: Context, key: string): Promise<Subject> {
  const entry = ctx.appearance.model(key);
  const object = (await staticModel(ctx, key, 1, null)) ?? new THREE.Group();
  const notes: string[] = [];
  if (entry?.fit) notes.push(`按水平最长边缩放到 ${entry.fit} 格（fit）`);
  else if (entry?.scale !== undefined) notes.push(`固定缩放 ${entry.scale}`);
  if (entry?.lieFlat) notes.push('平放（lieFlat）');
  if (entry?.lazy) notes.push('按需加载（lazy）');
  return { object, actor: null, rootScale: [1, 1, 1], model: key, placeScale: 1, variants: [key], source: entry?.url ?? '未知模型', notes };
}
