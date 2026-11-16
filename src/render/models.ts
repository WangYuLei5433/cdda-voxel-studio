// glTF model library: loads each model once (preloaded at startup) and serves
//  - static parts (geometry + material + local matrix) for instanced props, and
//  - animated instances (skinned-safe clones) for creatures, optionally tinted,
// plus procedural shapes for creatures no open asset covers (src/render/procedural.ts).
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

import type { Appearance, ModelEntry } from './appearance';
import { assetLoads } from './load-queue';
import { proceduralCreature, proceduralProp } from './procedural';

export type ClipRole = 'idle' | 'walk' | 'attack' | 'hit' | 'die' | 'interact' | 'pickup';

export interface ModelInstance {
  object: THREE.Object3D;
  play(role: ClipRole, once?: boolean): void;
  update(dt: number): void;
  freezeDeath?(): Promise<void>;
}

export interface StaticPart {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Transform from the placement origin (tile center, ground) to this mesh. */
  matrix: THREE.Matrix4;
}

/** Bounds of the meshes that are actually shown (hidden accessories excluded, skinning applied). */
function visibleBounds(object: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    if ((o as THREE.Mesh).isMesh) box.expandByObject(o, true);
    for (const c of o.children) visit(c);
  };
  visit(object);
  return box.isEmpty() ? new THREE.Box3().setFromObject(object) : box;
}

/** Scale + offset so the model sits on the ground, centered, spanning `fit` tiles. */
function normalize(object: THREE.Object3D, entry: ModelEntry, extraScale = 1): void {
  // Long things modelled upright (weapons, tools, bottles on their side) lie on the ground.
  object.rotation.set((entry.rotX ?? 0) + (entry.lieFlat ? -Math.PI / 2 : 0), entry.rotY ?? 0, entry.rotZ ?? 0);
  object.updateMatrixWorld(true);
  const box = visibleBounds(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const scale = (entry.fit ? entry.fit / Math.max(size.x, size.z, 1e-3) : entry.scale ?? 1) * extraScale;
  object.scale.setScalar(scale);
  object.position.set(entry.preserveOrigin ? 0 : -center.x * scale, (entry.preserveOrigin ? 0 : -box.min.y * scale) + (entry.y ?? 0), entry.preserveOrigin ? 0 : -center.z * scale);
}

function hideNodes(object: THREE.Object3D, hide: string[] | undefined): void {
  if (!hide?.length) return;
  object.traverse((o) => {
    if (hide.some((h) => o.name.includes(h))) o.visible = false;
  });
}

export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<GLTF | null>>();
  private readonly ready = new Map<string, GLTF>();
  private readonly parts = new Map<string, StaticPart[] | null>();
  private readonly textureLoader = new THREE.TextureLoader();
  private readonly textureCache = new Map<string, Promise<THREE.Texture | null>>();
  /** Called after a lazily loaded model arrives (the scene redraws to show it). */
  onLoaded: (() => void) | null = null;

  constructor(public appearance: Appearance) {}

  /** Switch to a rebuilt registry (the model editor after an edit); loaded files stay cached. */
  use(appearance: Appearance): void {
    this.appearance = appearance;
    this.parts.clear();
  }

  /** Cache key of a model file + its separate texture. */
  private static fileKey(entry: ModelEntry): string {
    return entry.texture ? `${entry.url}#${entry.texture}` : entry.url;
  }

  private colorTexture(url: string): Promise<THREE.Texture | null> {
    let p = this.textureCache.get(url);
    if (!p) {
      p = this.textureLoader.loadAsync(url).catch(() => null);
      this.textureCache.set(url, p);
    }
    return p;
  }

  private load(entry: ModelEntry): Promise<GLTF | null> {
    const key = ModelLibrary.fileKey(entry);
    const url = entry.url;
    let p = this.cache.get(key);
    if (!p) {
      p = assetLoads.run(() => Promise.all([this.loader.loadAsync(url), entry.texture ? this.colorTexture(entry.texture) : null])).then(
        ([g, map]) => {
          if (map) {
            // glTF UV convention (no vertical flip), colour texture.
            map.flipY = false;
            map.colorSpace = THREE.SRGBColorSpace;
            map.anisotropy = 4;
            g.scene.traverse((o) => {
              const mesh = o as THREE.Mesh;
              if (!mesh.isMesh) return;
              const apply = (m: THREE.Material) => {
                const std = m as THREE.MeshStandardMaterial;
                if ('map' in std) {
                  std.map = map;
                  std.color?.set(0xffffff);
                  std.needsUpdate = true;
                }
              };
              if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
              else apply(mesh.material);
            });
          }
          this.ready.set(key, g);
          return g;
        },
        (err) => {
          console.warn(`[models] failed to load ${url}:`, err);
          return null;
        },
      );
      this.cache.set(key, p);
    }
    return p;
  }

  /** Load every non-lazy model in the registry (call before the first snapshot). */
  async preload(): Promise<void> {
    await Promise.all(this.appearance.allModels().filter((e) => !e.url.startsWith('procedural:') && !e.lazy).map((e) => this.load(e)));
  }

  /** Load one model (lazy entries load on first use); resolves when it is usable. */
  async ensure(key: string): Promise<void> {
    const entry = this.appearance.model(key);
    if (entry && !entry.url.startsWith('procedural:')) {
      await this.load(entry);
      await Promise.all((entry.attachments ?? []).filter((a) => a.model !== key).map((a) => this.ensure(a.model)));
    }
  }

  /** Meshes of a static model for instancing; null if unknown or not loaded yet. */
  staticParts(key: string): StaticPart[] | null {
    if (this.parts.has(key)) return this.parts.get(key)!;
    const entry = this.appearance.model(key);
    if (entry?.url.startsWith('procedural:')) {
      const made = proceduralProp(entry.url.slice('procedural:'.length));
      if (made) this.parts.set(key, made);
      return made;
    }
    if (!entry) return null;
    const gltf = this.ready.get(ModelLibrary.fileKey(entry));
    if (!gltf) {
      // Not loaded yet (lazy pack models): load it, then let the scene try again.
      if (!this.cache.has(ModelLibrary.fileKey(entry))) void this.load(entry).then((g) => g && this.onLoaded?.());
      return null;
    }
    const attachments: StaticPart[] = [];
    for (const a of entry.attachments ?? []) {
      if (a.model === key) continue;
      const child = this.staticParts(a.model);
      if (!child) return null;
      const transform = new THREE.Matrix4().makeScale(a.scale, a.scale, a.scale).setPosition(...a.offset);
      for (const part of child) attachments.push({ ...part, matrix: transform.clone().multiply(part.matrix) });
    }
    const root = gltf.scene.clone(true);
    hideNodes(root, entry.hide);
    normalize(root, entry);
    const holder = new THREE.Group();
    holder.add(root);
    holder.updateMatrixWorld(true);
    const result: StaticPart[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !o.visible) return;
      let shown = true;
      for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible) shown = false;
      if (!shown) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) result.push({ geometry: mesh.geometry, material, matrix: mesh.matrixWorld.clone() });
    });
    result.push(...attachments);
    this.parts.set(key, result);
    return result;
  }

  /** An animated instance for a model key (or "procedural:<shape>"), optionally tinted. */
  async instantiate(key: string, tint?: number, extraScale = 1): Promise<ModelInstance | null> {
    if (key.startsWith('procedural:')) return proceduralCreature(key.slice('procedural:'.length), tint ?? 0x888888, extraScale);
    const entry = this.appearance.model(key);
    if (!entry) return null;
    const gltf = await this.load(entry);
    if (!gltf) return null;
    const object = SkeletonUtils.clone(gltf.scene);
    hideNodes(object, entry.hide);
    normalize(object, entry, extraScale);
    const tintColor = tint !== undefined ? new THREE.Color(tint) : null;
    object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        const mesh = o as THREE.Mesh;
        // Per-instance materials so damage flashes and tints don't affect other clones.
        const clone = (m: THREE.Material) => {
          const c = m.clone() as THREE.MeshStandardMaterial;
          if (tintColor && c.color) c.color.multiply(tintColor).lerp(tintColor, 0.35);
          return c;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(clone) : clone(mesh.material);
      }
    });
    const wrapper = new THREE.Group();
    wrapper.add(object);
    const mixer = new THREE.AnimationMixer(object);
    const clips = new Map(gltf.animations.map((c) => [c.name, c]));
    let current: THREE.AnimationAction | null = null;
    let onFinished: (() => void) | null = null;
    mixer.addEventListener('finished', () => onFinished?.());

    const play = (role: ClipRole, once = false) => {
      const name = entry.anim?.[role];
      const clip = name ? clips.get(name) : undefined;
      if (!clip) return;
      const action = mixer.clipAction(clip);
      action.reset();
      action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, once ? 1 : Infinity);
      action.clampWhenFinished = role === 'die';
      if (current && current !== action) action.crossFadeFrom(current, 0.12, false);
      action.play();
      current = action;
      onFinished = once && role !== 'die' ? () => play('idle') : null;
    };

    return { object: wrapper, play, update: (dt) => mixer.update(dt) };
  }
}
