import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { meshItemKey, meshLibraryItems, placeMesh, type LoadedMeshSet, type MeshItem } from '../../src/mesh/library';
import { formatMeshSet, isMeshFile, meshScale, missingClips, parseMeshSet, sizeFields, type MeshEntry } from '../../src/mesh/meshset';
import { VoxMatcher } from '../../src/vox/match';
import { VoxelSetIndex } from '../../src/vox/voxelset';

const set = parseMeshSet(JSON.stringify({
  name: 'test', author: 'someone',
  models: [
    { id: 'mon_zombie', file: 'zombie.glb', height: 1.7, animations: { idle: 'Idle', walk: 'Walk' }, custom: 1 },
    { id: ['f_chair', 'f_stool'], files: ['chair_a.glb', 'chair_b.obj'], fit: 0.8, rotY: 90 },
    { builtin: 'tree', file: 'tree.gltf' },
  ],
}));

describe('meshset.json', () => {
  it('is written back with unknown fields and the order of entries', () => {
    expect(parseMeshSet(formatMeshSet(set))).toEqual(set);
    expect(formatMeshSet(set)).toContain('"author": "someone"');
    expect(set.models[0].custom).toBe(1);
  });

  it('rejects documents that are not sets', () => {
    expect(() => parseMeshSet('[]')).toThrow();
    expect(() => parseMeshSet('{"models": 3}')).toThrow();
    expect(parseMeshSet('{}')).toEqual({ name: 'mesh set', models: [] });
  });

  it('knows mesh files', () => {
    expect(['a.glb', 'b.GLTF', 'c.obj'].every(isMeshFile)).toBe(true);
    expect(isMeshFile('d.vox')).toBe(false);
  });

  it('finds objects by id, looks_like and built-in type, like a voxel set', () => {
    const index = new VoxelSetIndex<MeshEntry>(set);
    const ll = (id: string) => ({ mon_zombie_fat: 'mon_zombie' })[id];
    expect(index.resolve('monster', 'mon_zombie_fat', ll)).toMatchObject({ via: 'looks_like', entry: { file: 'zombie.glb' } });
    expect(index.resolve('furn', 'f_stool', ll)).toMatchObject({ via: 'id', entry: { fit: 0.8 } });
    expect(index.resolve('ter', 't_tree_oak', ll, { type: 'tree' })).toMatchObject({ via: 'builtin', entry: { file: 'tree.gltf' } });
  });

  it('library items and the matcher use "mesh:<set>:<file>" keys and step through variants', () => {
    const loaded: LoadedMeshSet = { id: 'demo', base: '/mesh/demo/', set };
    const items = new Map(meshLibraryItems([loaded]).map((i) => [i.key, i]));
    expect([...items.keys()]).toEqual(['mesh:demo:zombie.glb', 'mesh:demo:chair_a.glb', 'mesh:demo:chair_b.obj', 'mesh:demo:tree.gltf']);
    const matcher = new VoxMatcher<MeshEntry, LoadedMeshSet, MeshItem>([loaded], { furn: [{ id: 'f_chair' }] }, null, items, meshItemKey);
    expect(matcher.find('furn', 'f_chair', 0)?.item.file).toBe('chair_a.glb');
    expect(matcher.find('furn', 'f_chair', 1)?.item.file).toBe('chair_b.obj');
    expect(matcher.find('furn', 'f_table')).toBeNull();
  });

  it('a set with match "exact" binds exact ids only (no looks_like, no built-in type)', () => {
    const exact: LoadedMeshSet = { id: 'strict', base: '/mesh/strict/', set: { ...set, match: 'exact' } };
    const items = new Map(meshLibraryItems([exact]).map((i) => [i.key, i]));
    const catalog = { monster: [{ id: 'mon_zombie' }, { id: 'mon_zombie_fat', looksLike: 'mon_zombie' }], ter: [{ id: 't_tree_oak' }] };
    const builtin = { ter: { t_tree_oak: { builtin: 'tree' } } };
    const matcher = new VoxMatcher<MeshEntry, LoadedMeshSet, MeshItem>([exact], catalog, builtin, items, meshItemKey);
    expect(matcher.find('monster', 'mon_zombie')?.via).toBe('id');
    expect(matcher.find('monster', 'mon_zombie_fat')).toBeNull();
    expect(matcher.find('ter', 't_tree_oak')).toBeNull();
    const loose = new VoxMatcher<MeshEntry, LoadedMeshSet, MeshItem>([{ ...exact, set }], catalog, builtin, new Map(meshLibraryItems([{ ...exact, set }]).map((i) => [i.key, i])), meshItemKey);
    expect(loose.find('monster', 'mon_zombie_fat')?.via).toBe('looks_like');
    expect(loose.find('ter', 't_tree_oak')?.via).toBe('builtin');
  });

  it('size: height wins over fit, fit over scale', () => {
    expect(meshScale({ height: 2 }, [1, 4, 1])).toBe(0.5);
    expect(meshScale({ fit: 1, scale: 3 }, [2, 1, 4])).toBe(0.25);
    expect(meshScale({ scale: 3 }, [2, 1, 4])).toBe(3);
    expect(meshScale({}, [2, 1, 4])).toBe(1);
    expect(sizeFields({ fit: 1, scale: 3 })).toEqual(['fit', 'scale']);
  });

  it('reports clip names the file does not have', () => {
    expect(missingClips(set.models[0], ['Idle', 'Run'])).toEqual(['Walk']);
  });
});

describe('placing a mesh', () => {
  /** A 2 × 1 × 4 box whose own origin is off its center. */
  const model = () => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(2, 1, 4).translate(5, 3, -1)));
    return g;
  };
  const bounds = (o: THREE.Object3D) => {
    const root = new THREE.Group();
    root.add(o);
    root.updateMatrixWorld(true);
    return new THREE.Box3().setFromObject(root);
  };

  it('stands on the ground, centred on the tile, scaled by fit', () => {
    const m = model();
    const { size, scale } = placeMesh(m, { fit: 1 });
    expect(size.map((n) => +n.toFixed(6))).toEqual([2, 1, 4]);
    expect(scale).toBe(0.25);
    const b = bounds(m);
    expect(b.min.y).toBeCloseTo(0);
    expect(b.max.y).toBeCloseTo(0.25);
    expect((b.min.z + b.max.z) / 2).toBeCloseTo(0);
    expect(b.max.z - b.min.z).toBeCloseTo(1);
  });

  it('turns before measuring, lies flat, and moves by offset', () => {
    const m = model();
    placeMesh(m, { rotY: 90, offset: [0, 0.5, 0] });
    const b = bounds(m);
    expect(b.max.x - b.min.x).toBeCloseTo(4);
    expect(b.min.y).toBeCloseTo(0.5);
    const flat = model();
    const { size } = placeMesh(flat, { lieFlat: true, height: 2 });
    expect(size[1]).toBeCloseTo(4);
    expect(bounds(flat).max.y).toBeCloseTo(2);
  });

  it('keeps its own origin when asked, and hides nodes by name', () => {
    const m = model();
    const extra = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 10));
    extra.name = 'Sword_01';
    m.add(extra);
    placeMesh(m, { preserveOrigin: true, hide: ['Sword'] });
    expect(extra.visible).toBe(false);
    expect(m.position.toArray()).toEqual([0, 0, 0]);
  });
});
