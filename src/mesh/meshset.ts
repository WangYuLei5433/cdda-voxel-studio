// meshset.json: a mesh model set, the counterpart of voxelset.json for regular 3D models
// (.glb / .gltf / .obj). A set is a folder with meshset.json and the model files. Entries bind
// CDDA ids (or a built-in model type) to files exactly as voxelset.json does; placement uses
// the fields of Cataclysm-Vox's appearance registry (src/render/appearance.ts ModelEntry), so
// the game can read the same file. cataclysm-3d does not read mesh sets.
// The studio keeps fields it does not know, and the order of entries, when it writes the file back.
import { formatModelSet } from '../vox/voxelset';

/** Animation states and the glTF clip each one plays. */
export type MeshRole = 'idle' | 'walk' | 'attack' | 'death';
export const MESH_ROLES: MeshRole[] = ['idle', 'walk', 'attack', 'death'];

export interface MeshEntry {
  id?: string | string[];
  builtin?: string;
  material?: string;
  file?: string;
  files?: string[];
  /** Size factor (1 model unit = 1 tile = 1 m). Ignored when `fit` or `height` is set. */
  scale?: number;
  /** Scale so the larger horizontal side spans this many tiles. */
  fit?: number;
  /** Scale so the model is this many tiles high (wins over `fit`). */
  height?: number;
  /** [x, y, z] shift in tiles after placing; y is up. */
  offset?: [number, number, number];
  /** Turns in degrees, applied X, Y, Z before measuring. */
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  /** Lay the model down (−90° about X): long items modelled standing up. */
  lieFlat?: boolean;
  /** Keep the model's own origin instead of standing it on the ground, centred on the tile. */
  preserveOrigin?: boolean;
  /** Node-name substrings to hide. */
  hide?: string[];
  rotates?: boolean;
  random_rotation?: boolean;
  tint?: boolean;
  emissive?: boolean;
  /** glTF clip name per state. */
  animations?: Partial<Record<MeshRole, string>>;
  [extra: string]: unknown;
}

export interface MeshSet {
  name: string;
  /** "exact": entries bind their exact ids only, never through looks_like or built-in types. */
  match?: 'exact' | 'lookup';
  models: MeshEntry[];
  [extra: string]: unknown;
}

/** File types a mesh set (and a voxel set's mesh entries) may name. */
export const MESH_FILE = /\.(glb|gltf|obj)$/i;
export const isMeshFile = (file: string): boolean => MESH_FILE.test(file);

export function parseMeshSet(text: string): MeshSet {
  const doc = JSON.parse(text) as Partial<MeshSet>;
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('meshset.json must be an object');
  if (doc.models !== undefined && !Array.isArray(doc.models)) throw new Error('"models" must be a list');
  return { ...doc, name: typeof doc.name === 'string' ? doc.name : 'mesh set', models: doc.models ?? [] };
}

/** meshset.json text: two-space indent, one entry per line in "models". */
export const formatMeshSet = (set: MeshSet): string => formatModelSet(set);

/** Every file an entry names (variants). */
export function meshEntryFiles(e: MeshEntry): string[] {
  return [...(e.file ? [e.file] : []), ...(e.files ?? [])];
}

/** Clip names an entry asks for that the model does not have. */
export function missingClips(e: MeshEntry, clips: string[]): string[] {
  return Object.values(e.animations ?? {}).filter((c): c is string => typeof c === 'string' && !clips.includes(c));
}

/** How much to scale a model of `size` (x, y, z in model units, after turning) for an entry. */
export function meshScale(e: Pick<MeshEntry, 'scale' | 'fit' | 'height'>, size: [number, number, number]): number {
  if (typeof e.height === 'number' && e.height > 0) return e.height / Math.max(size[1], 1e-6);
  if (typeof e.fit === 'number' && e.fit > 0) return e.fit / Math.max(size[0], size[2], 1e-6);
  return typeof e.scale === 'number' && e.scale > 0 ? e.scale : 1;
}

/** Placement fields that override each other (more than one set is worth a note). */
export function sizeFields(e: Pick<MeshEntry, 'scale' | 'fit' | 'height'>): string[] {
  return (['height', 'fit', 'scale'] as const).filter((k) => typeof e[k] === 'number');
}
