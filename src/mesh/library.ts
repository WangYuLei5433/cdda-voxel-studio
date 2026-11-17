// Mesh sets the studio can show (meshset.json + .glb / .gltf / .obj files), as a browsable
// library next to the voxel sets. The dev server lists the sets under vendor/mesh/
// (GET /api/mesh/sets) and serves their files at /mesh/<set>/…. The same loader also draws
// the .obj entries of voxel sets (cataclysm-3d voxelizes those when it loads them).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

import { meshEntryFiles, meshScale, parseMeshSet, type MeshEntry, type MeshSet } from './meshset';

export interface LoadedMeshSet {
  /** Folder name, used in ids. */
  id: string;
  /** Base URL of the set's files (ends with "/"). */
  base: string;
  set: MeshSet;
}

/** One library item: a model file and the entries that use it. */
export interface MeshItem {
  /** "mesh:<set>:<file>" (voxel items are "<set>:<file>"). */
  key: string;
  set: LoadedMeshSet;
  file: string;
  entries: MeshEntry[];
}

export const meshItemKey = (set: { id: string }, file: string): string => `mesh:${set.id}:${file}`;

export const fileUrl = (base: string, file: string): string => base + file.split('/').map(encodeURIComponent).join('/');

export async function loadMeshSets(): Promise<LoadedMeshSet[]> {
  try {
    const res = await fetch('/api/mesh/sets', { cache: 'no-store' });
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return [];
    const ids = (await res.json()) as string[];
    const out: LoadedMeshSet[] = [];
    for (const id of ids) {
      const base = `/mesh/${encodeURIComponent(id)}/`;
      const r = await fetch(`${base}meshset.json`, { cache: 'no-store' });
      if (r.ok) out.push({ id, base, set: parseMeshSet(await r.text()) });
    }
    return out;
  } catch {
    return [];
  }
}

/** Every model file of the sets, with the entries naming it (first use first). */
export function meshLibraryItems(sets: LoadedMeshSet[]): MeshItem[] {
  const items = new Map<string, MeshItem>();
  for (const s of sets) {
    for (const e of s.set.models) {
      for (const file of meshEntryFiles(e)) {
        const key = meshItemKey(s, file);
        const item = items.get(key) ?? { key, set: s, file, entries: [] };
        item.entries.push(e);
        items.set(key, item);
      }
    }
  }
  return [...items.values()];
}

// ── Loading ─────────────────────────────────────────────────────────────────────────────

/** A loaded model file, shared: every use gets its own clone (buildMesh). */
export interface LoadedMesh {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
  triangles: number;
  textures: number;
}

const gltfLoader = new GLTFLoader();
const cache = new Map<string, Promise<LoadedMesh>>();

function stats(scene: THREE.Object3D): { triangles: number; textures: number } {
  let triangles = 0;
  const textures = new Set<THREE.Texture>();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const g = mesh.geometry;
    triangles += (g.index ? g.index.count : g.getAttribute('position')?.count ?? 0) / 3;
    for (const m of [mesh.material].flat()) for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture) textures.add(v as THREE.Texture);
  });
  return { triangles: Math.round(triangles), textures: textures.size };
}

/** .obj with the materials (and map_Kd textures) of the .mtl it names, when there is one. */
async function loadObj(url: string): Promise<THREE.Object3D> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  const text = await res.text();
  const loader = new OBJLoader();
  const lib = /^mtllib\s+(.+?)\s*$/m.exec(text)?.[1];
  if (lib) {
    const dir = url.slice(0, url.lastIndexOf('/') + 1);
    try {
      const materials = await new MTLLoader().loadAsync(dir + lib.split('/').map(encodeURIComponent).join('/'));
      materials.preload();
      loader.setMaterials(materials);
    } catch {
      /* missing .mtl: OBJLoader's grey material */
    }
  }
  return loader.parse(text);
}

async function loadFile(url: string): Promise<LoadedMesh> {
  const path = url.split('?')[0].toLowerCase();
  if (path.endsWith('.obj')) {
    const scene = await loadObj(url);
    return { scene, clips: [], ...stats(scene) };
  }
  if (path.endsWith('.glb') || path.endsWith('.gltf')) {
    const g = await gltfLoader.loadAsync(url);
    return { scene: g.scene, clips: g.animations, ...stats(g.scene) };
  }
  throw new Error(`not a mesh file: ${url}`);
}

/** A model file (fetched once). */
export function fetchMesh(url: string): Promise<LoadedMesh> {
  let p = cache.get(url);
  if (!p) {
    p = loadFile(url);
    p.catch(() => cache.delete(url));
    cache.set(url, p);
  }
  return p;
}

// ── Placement ───────────────────────────────────────────────────────────────────────────

/** How a model is placed on its tile (a mesh set entry, or a voxel set's .obj entry in tiles). */
export type Placement = Pick<MeshEntry, 'scale' | 'fit' | 'height' | 'offset' | 'rotX' | 'rotY' | 'rotZ' | 'lieFlat' | 'preserveOrigin' | 'hide'>;

const rad = (deg: number | undefined) => ((deg ?? 0) * Math.PI) / 180;

/** Bounds of the meshes that are shown (hidden nodes left out, skinning applied). */
export function visibleBounds(object: THREE.Object3D): THREE.Box3 {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const visit = (o: THREE.Object3D) => {
    if (!o.visible) return;
    if ((o as THREE.Mesh).isMesh) box.expandByObject(o, true);
    for (const c of o.children) visit(c);
  };
  visit(object);
  return box;
}

/**
 * Turn, scale and move `model` (no parent) the way the entry places it: the turned model stands
 * on the ground centred on the tile (unless preserveOrigin), then `offset` moves it.
 * Returns the model's own size after turning, before scaling (model units) and the scale used.
 */
export function placeMesh(model: THREE.Object3D, p: Placement): { size: [number, number, number]; scale: number } {
  if (p.hide?.length) model.traverse((o) => { if (p.hide!.some((h) => o.name.includes(h))) o.visible = false; });
  model.position.set(0, 0, 0);
  model.scale.setScalar(1);
  model.rotation.set(rad(p.rotX) + (p.lieFlat ? -Math.PI / 2 : 0), rad(p.rotY), rad(p.rotZ));
  const box = visibleBounds(model);
  const size = box.isEmpty() ? new THREE.Vector3() : box.getSize(new THREE.Vector3());
  const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
  const s = meshScale(p, [size.x, size.y, size.z]);
  model.scale.setScalar(s);
  if (!p.preserveOrigin && !box.isEmpty()) model.position.set(-center.x * s, -box.min.y * s, -center.z * s);
  const [ox, oy, oz] = Array.isArray(p.offset) ? p.offset : [0, 0, 0];
  model.position.add(new THREE.Vector3(Number(ox) || 0, Number(oy) || 0, Number(oz) || 0));
  return { size: [size.x, size.y, size.z], scale: s };
}

/** Copy every material (so a tint or glow does not reach other uses of the file) and change it. */
function eachMaterialCopy(object: THREE.Object3D, change: (m: THREE.Material) => void): void {
  object.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const copy = (m: THREE.Material) => {
      const c = m.clone();
      change(c);
      return c;
    };
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(copy) : copy(mesh.material);
  });
}

export interface BuiltMesh {
  object: THREE.Object3D;
  loaded: LoadedMesh;
  /** Model size after turning, before scaling (model units), and the scale used. */
  size: [number, number, number];
  scale: number;
  /** Plays the model's clips (null when it has none). */
  mixer: THREE.AnimationMixer | null;
}

/** A placed copy of a model file; `tint` multiplies its colors, `emissive` makes it glow. */
export async function buildMesh(url: string, p: Placement, opts: { tint?: number; emissive?: boolean } = {}): Promise<BuiltMesh> {
  const loaded = await fetchMesh(url);
  const model = SkeletonUtils.clone(loaded.scene);
  if (opts.tint !== undefined || opts.emissive) {
    const tint = opts.tint !== undefined ? new THREE.Color(opts.tint) : null;
    eachMaterialCopy(model, (m) => {
      const std = m as THREE.MeshStandardMaterial;
      if (tint && std.color) std.color.multiply(tint);
      if (opts.emissive && std.emissive) {
        std.emissive.copy(std.color ?? new THREE.Color(0xffffff));
        if (std.map) std.emissiveMap = std.map;
        std.emissiveIntensity = 1;
      }
    });
  }
  const { size, scale } = placeMesh(model, p);
  const root = new THREE.Group();
  root.add(model);
  return { object: root, loaded, size, scale, mixer: loaded.clips.length ? new THREE.AnimationMixer(model) : null };
}
