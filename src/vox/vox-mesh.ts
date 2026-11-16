// A .vox model as Three.js geometry, placed the way cataclysm-3d places it:
// - one voxel is 1 / voxelsPerTile of a tile on every axis (a z-level is 2 tiles high at 8);
// - the footprint is centered on the tile (integer offset (size − voxelsPerTile) / 2);
// - voxel layer 0 stands on the ground; MagicaVoxel +y faces north (−z here), +z is up.
// Faces are merged greedily (same color, same plane) and glass goes to its own geometry.
import * as THREE from 'three';

import type { VoxModel } from './vox-format';

export interface VoxGeometry {
  opaque: THREE.BufferGeometry | null;
  glass: THREE.BufferGeometry | null;
  /** Size in tiles: x (east–west), y (height), z (north–south). */
  size: [number, number, number];
  voxelCount: number;
  /** Merged quads (opaque + glass). */
  quadCount: number;
}

/** Game-axis grid: x east, y up, z south (cataclysm-3d voxel_grid). Index = color + 1, 0 = empty. */
function toGrid(vox: VoxModel): { dims: [number, number, number]; cells: Uint16Array } {
  const [sx, sz, sy] = vox.size;
  const dims: [number, number, number] = [sx, sy, sz];
  const cells = new Uint16Array(sx * sy * sz);
  const v = vox.voxels;
  for (let i = 0; i + 3 < v.length; i += 4) {
    const x = v[i];
    const y = v[i + 2];
    const z = sz - 1 - v[i + 1];
    if (x >= sx || y >= sy || z < 0 || z >= sz) continue;
    cells[x + sx * (y + sy * z)] = v[i + 3] + 1;
  }
  return { dims, cells };
}

export function voxGeometry(vox: VoxModel, voxelsPerTile = 8): VoxGeometry {
  const { dims, cells } = toGrid(vox);
  const [sx, sy, sz] = dims;
  const at = (x: number, y: number, z: number) => (x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? 0 : cells[x + sx * (y + sy * z)]);
  const isGlass = (c: number) => c > 0 && vox.glass[c - 1];
  // A face of cell `a` toward neighbour `b` shows when b is empty, or when a is opaque and b glass.
  const shows = (a: number, b: number) => a > 0 && (b === 0 || (!isGlass(a) && isGlass(b)));

  const offX = Math.trunc((sx - voxelsPerTile) / 2);
  const offZ = Math.trunc((sz - voxelsPerTile) / 2);
  const s = 1 / voxelsPerTile;
  const place = (p: number[]): [number, number, number] => [(p[0] - offX) * s - 0.5, p[1] * s, (p[2] - offZ) * s - 0.5];

  const out = { opaque: { pos: [] as number[], nor: [] as number[], col: [] as number[], idx: [] as number[] }, glass: { pos: [] as number[], nor: [] as number[], col: [] as number[], idx: [] as number[] } };
  let quads = 0;
  const color = new THREE.Color();
  const quad = (corners: number[][], normal: number[], c: number) => {
    const buf = isGlass(c) ? out.glass : out.opaque;
    const rgb = vox.palette[c - 1] ?? 0xffffff;
    color.setRGB(((rgb >> 16) & 0xff) / 255, ((rgb >> 8) & 0xff) / 255, (rgb & 0xff) / 255, THREE.SRGBColorSpace);
    const base = buf.pos.length / 3;
    for (const p of corners) {
      buf.pos.push(...place(p));
      buf.nor.push(...normal);
      buf.col.push(color.r, color.g, color.b);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    quads++;
  };

  // Greedy meshing (Mikola Lysenko's sweep): for each axis d, sweep planes, build a mask of
  // visible faces (signed color: + facing +d, − facing −d) and merge equal rectangles.
  for (let d = 0; d < 3; d++) {
    const u = (d + 1) % 3;
    const w = (d + 2) % 3;
    const x = [0, 0, 0];
    const q = [0, 0, 0];
    q[d] = 1;
    const mask = new Int32Array(dims[u] * dims[w]);
    for (x[d] = -1; x[d] < dims[d];) {
      let n = 0;
      for (x[w] = 0; x[w] < dims[w]; x[w]++) {
        for (x[u] = 0; x[u] < dims[u]; x[u]++, n++) {
          const a = at(x[0], x[1], x[2]);
          const b = at(x[0] + q[0], x[1] + q[1], x[2] + q[2]);
          mask[n] = shows(a, b) ? a : shows(b, a) ? -b : 0;
        }
      }
      x[d]++;
      n = 0;
      for (let j = 0; j < dims[w]; j++) {
        for (let i = 0; i < dims[u];) {
          const c = mask[n];
          if (!c) {
            i++;
            n++;
            continue;
          }
          let width = 1;
          while (i + width < dims[u] && mask[n + width] === c) width++;
          let height = 1;
          grow: for (; j + height < dims[w]; height++) {
            for (let k = 0; k < width; k++) if (mask[n + k + height * dims[u]] !== c) break grow;
          }
          x[u] = i;
          x[w] = j;
          const du = [0, 0, 0];
          const dw = [0, 0, 0];
          du[u] = width;
          dw[w] = height;
          const p0 = [x[0], x[1], x[2]];
          const p1 = [x[0] + du[0], x[1] + du[1], x[2] + du[2]];
          const p2 = [x[0] + du[0] + dw[0], x[1] + du[1] + dw[1], x[2] + du[2] + dw[2]];
          const p3 = [x[0] + dw[0], x[1] + dw[1], x[2] + dw[2]];
          const normal = [0, 0, 0];
          normal[d] = c > 0 ? 1 : -1;
          // Counter-clockwise seen from the side the normal points to.
          quad(c > 0 ? [p0, p1, p2, p3] : [p0, p3, p2, p1], normal, Math.abs(c));
          for (let l = 0; l < height; l++) for (let k = 0; k < width; k++) mask[n + k + l * dims[u]] = 0;
          i += width;
          n += width;
        }
      }
    }
  }

  const build = (b: typeof out.opaque) => {
    if (!b.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    g.computeBoundingBox();
    return g;
  };
  return { opaque: build(out.opaque), glass: build(out.glass), size: [sx * s, sy * s, sz * s], voxelCount: vox.voxels.length / 4, quadCount: quads };
}

/** A mesh group for a .vox model (vertex colors; glass translucent). */
export function voxObject(vox: VoxModel, voxelsPerTile = 8, options: { tint?: number; emissive?: boolean } = {}): THREE.Group {
  const geo = voxGeometry(vox, voxelsPerTile);
  const group = new THREE.Group();
  const tint = new THREE.Color(options.tint ?? 0xffffff);
  if (geo.opaque) {
    const m = new THREE.Mesh(geo.opaque, new THREE.MeshStandardMaterial({ vertexColors: true, color: tint, roughness: 0.9, metalness: 0, ...(options.emissive ? { emissive: 0xffffff, emissiveIntensity: 0.6 } : {}) }));
    m.castShadow = m.receiveShadow = true;
    group.add(m);
  }
  if (geo.glass) {
    const m = new THREE.Mesh(geo.glass, new THREE.MeshStandardMaterial({ vertexColors: true, color: tint, transparent: true, opacity: 0.45, roughness: 0.1, depthWrite: false }));
    group.add(m);
  }
  group.userData.vox = { voxels: geo.voxelCount, quads: geo.quadCount, size: geo.size };
  return group;
}
