import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { readVox, writeVox, type VoxModel } from '../../src/vox/vox-format';
import { voxGeometry } from '../../src/vox/vox-mesh';
import { bindFile, checkModel, formatVoxelSet, parseVoxelSet, VoxelSetIndex } from '../../src/vox/voxelset';

const STARTER = 'vendor/voxel/starter';
const buffer = (path: string) => { const b = readFileSync(path); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };

/** A w × d × h box of color 1 (palette red, color 2 glass). */
function box(w: number, d: number, h: number, colorAt = (_x: number, _y: number, _z: number) => 1): VoxModel {
  const v: number[] = [];
  for (let x = 0; x < w; x++) for (let y = 0; y < d; y++) for (let z = 0; z < h; z++) v.push(x, y, z, colorAt(x, y, z));
  const palette = new Uint32Array(256);
  palette[1] = 0xff0000;
  palette[2] = 0x88ccff;
  const glass = new Array(256).fill(false);
  glass[2] = true;
  return { size: [w, d, h], voxels: new Uint8Array(v), palette, glass, modelCount: 1 };
}

describe('.vox files', () => {
  it('write → read keeps size, voxels, colors and glass', () => {
    const m = box(3, 2, 4, (x) => (x === 0 ? 2 : 1));
    const back = readVox(writeVox(m));
    expect(back.size).toEqual([3, 2, 4]);
    expect([...back.voxels]).toEqual([...m.voxels]);
    expect(back.palette[1]).toBe(0xff0000);
    expect(back.glass[2]).toBe(true);
    expect(back.glass[1]).toBe(false);
  });

  it('rejects files that are not .vox', () => {
    expect(() => readVox(new TextEncoder().encode('hello world!').buffer)).toThrow(/MagicaVoxel/);
  });
});

describe('voxel meshes', () => {
  it('a solid box is six merged quads, centered on the tile, standing on the ground', () => {
    const g = voxGeometry(box(8, 8, 16));
    expect(g.quadCount).toBe(6);
    expect(g.size).toEqual([1, 2, 1]);
    const bb = g.opaque!.boundingBox!;
    expect([bb.min.x, bb.min.y, bb.min.z]).toEqual([-0.5, 0, -0.5]);
    expect([bb.max.x, bb.max.y, bb.max.z]).toEqual([0.5, 2, 0.5]);
  });

  it('MagicaVoxel +y is north (−z), +z is up', () => {
    // One voxel at the north end (y = 7) of an 8 × 8 × 1 footprint.
    const m: VoxModel = { ...box(1, 1, 1), size: [8, 8, 1], voxels: new Uint8Array([0, 7, 0, 1]) };
    const bb = voxGeometry(m).opaque!.boundingBox!;
    expect(bb.min.z).toBeCloseTo(-0.5);
    expect(bb.max.z).toBeCloseTo(-0.375);
  });

  it('glass goes to its own geometry and does not hide opaque faces behind it', () => {
    const g = voxGeometry(box(2, 1, 1, (x) => (x === 0 ? 2 : 1)));
    expect(g.glass).not.toBeNull();
    expect(g.opaque).not.toBeNull();
    // The opaque voxel shows all six faces (one is behind glass).
    expect(g.opaque!.index!.count / 6).toBe(6);
  });

  it('flags models that break the conventions', () => {
    expect(checkModel([8, 8, 13], box(8, 8, 13).voxels, 8)).toEqual([]);
    expect(checkModel([9, 8, 4], new Uint8Array([0, 0, 2, 1]), 8)).toEqual(['floating', 'odd-width']);
  });
});

describe('voxelset.json', () => {
  const set = parseVoxelSet(JSON.stringify({
    name: 'test', voxels_per_tile: 8, author: 'someone',
    models: [
      { id: 'mon_zombie', file: 'z.vox', custom: 1 },
      { id: ['f_chair', 'f_stool'], files: ['a.vox', 'b.vox'] },
      { builtin: 'wall', material: 'brick', file: 'brick.vox' },
      { builtin: 'wall', file: 'wall.vox' },
      { id: 'vp_frame', file: 'frame.vox' },
    ],
  }));
  const index = new VoxelSetIndex(set);
  const chain: Record<string, string> = { mon_zombie_fat: 'mon_zombie', mon_x: 'mon_y' };
  const ll = (id: string) => chain[id];

  it('looks objects up by id, then looks_like, then built-in type and material', () => {
    expect(index.resolve('monster', 'mon_zombie', ll)).toMatchObject({ via: 'id', entry: { file: 'z.vox' } });
    expect(index.resolve('monster', 'mon_zombie_fat', ll)).toMatchObject({ via: 'looks_like', matched: 'mon_zombie' });
    expect(index.resolve('furn', 'f_stool', ll)).toMatchObject({ via: 'id' });
    expect(index.resolve('ter', 't_wall_b', ll, { type: 'wall', material: 'brick' })).toMatchObject({ via: 'builtin', entry: { file: 'brick.vox' } });
    expect(index.resolve('ter', 't_wall', ll, { type: 'wall', material: 'wood' })).toMatchObject({ via: 'builtin', entry: { file: 'wall.vox' } });
    expect(index.resolve('vpart', 'frame', ll)).toMatchObject({ via: 'id' });
    expect(index.resolve('monster', 'mon_x', ll)).toBeNull();
  });

  it('binding a file keeps unknown fields and the order of entries', () => {
    const next = bindFile(bindFile(set, 'monster', 'mon_zombie', 'new.vox'), 'item', 'fire_axe', 'axe.vox');
    expect(next.models[0]).toEqual({ id: 'mon_zombie', file: 'new.vox', custom: 1 });
    expect(next.models.at(-1)).toEqual({ id: 'fire_axe', file: 'axe.vox' });
    expect(parseVoxelSet(formatVoxelSet(next))).toEqual(next);
    expect(formatVoxelSet(next)).toContain('"author": "someone"');
  });
});

describe.skipIf(!existsSync(STARTER))('cataclysm-3d starter kit (node tools/fetch-voxel-starter.mjs)', () => {
  it('voxelset.json is written back byte for byte', () => {
    const text = readFileSync(`${STARTER}/voxelset.json`, 'utf8');
    expect(formatVoxelSet(parseVoxelSet(text))).toBe(text);
  });

  it('every model reads, meshes with merged faces, and keeps the size limits', () => {
    const files = readdirSync(`${STARTER}/builtin`).filter((f) => f.endsWith('.vox'));
    expect(files.length).toBeGreaterThan(100);
    let voxels = 0;
    let quads = 0;
    for (const f of files) {
      const m = readVox(buffer(`${STARTER}/builtin/${f}`));
      const g = voxGeometry(m);
      expect(g.voxelCount, f).toBeGreaterThan(0);
      expect(g.quadCount, f).toBeLessThanOrEqual(g.voxelCount * 6);
      voxels += g.voxelCount;
      quads += g.quadCount;
      expect(checkModel(m.size, m.voxels, 8).filter((p) => p === 'size' || p === 'empty'), f).toEqual([]);
    }
    // Greedy merging: far fewer quads than one per voxel face.
    expect(quads).toBeLessThan(voxels * 6 * 0.2);
    const human = readVox(buffer(`${STARTER}/builtin/humanoid.vox`));
    expect(human.size[2]).toBeGreaterThanOrEqual(12);
  });
});
