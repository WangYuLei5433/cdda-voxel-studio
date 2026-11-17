// A small mesh set for the browser tests, written to vendor/mesh/<name>/:
//   box.glb   – a 1 × 2 × 0.5 box (W × H × D) with a 1×1 texture and a clip "Idle"
//   crate.obj – a unit cube with a red material from crate.mtl
// built by hand (no exporter), so the files are exactly what the tests expect.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = CRC[(c ^ x) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

/** A 1×1 RGB PNG of one color. */
function png(r: number, g: number, b: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'ascii');
    data.copy(out, 8);
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.from([0, r, g, b]))), chunk('IEND', Buffer.alloc(0))]);
}
const PNG = png(200, 160, 90);

/** Faces of an axis-aligned box: positions, normals, uvs (4 vertices per face) and indices. */
function boxMesh(w: number, h: number, d: number) {
  const [x, y, z] = [w / 2, h, d / 2];
  const faces: [number[], number[][]][] = [
    [[1, 0, 0], [[x, 0, z], [x, 0, -z], [x, y, -z], [x, y, z]]],
    [[-1, 0, 0], [[-x, 0, -z], [-x, 0, z], [-x, y, z], [-x, y, -z]]],
    [[0, 1, 0], [[-x, y, z], [x, y, z], [x, y, -z], [-x, y, -z]]],
    [[0, -1, 0], [[-x, 0, -z], [x, 0, -z], [x, 0, z], [-x, 0, z]]],
    [[0, 0, 1], [[-x, 0, z], [x, 0, z], [x, y, z], [-x, y, z]]],
    [[0, 0, -1], [[x, 0, -z], [-x, 0, -z], [-x, y, -z], [x, y, -z]]],
  ];
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], idx: number[] = [];
  faces.forEach(([n, vs], f) => {
    for (const v of vs) {
      pos.push(...v);
      nrm.push(...n);
    }
    uv.push(0, 1, 1, 1, 1, 0, 0, 0);
    idx.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  return { pos, nrm, uv, idx };
}

/** A binary glTF: one textured box node "Body" and an animation "Idle" moving it up and down. */
export function boxGlb(w: number, h: number, d: number): Buffer {
  const { pos, nrm, uv, idx } = boxMesh(w, h, d);
  const parts: Buffer[] = [];
  const views: object[] = [];
  let offset = 0;
  const add = (b: Buffer) => {
    const pad = (4 - (b.length % 4)) % 4;
    views.push({ buffer: 0, byteOffset: offset, byteLength: b.length });
    parts.push(b, Buffer.alloc(pad));
    offset += b.length + pad;
    return views.length - 1;
  };
  const f32 = (a: number[]) => Buffer.from(new Float32Array(a).buffer);
  const vPos = add(f32(pos)), vNrm = add(f32(nrm)), vUv = add(f32(uv)), vIdx = add(Buffer.from(new Uint16Array(idx).buffer));
  const vTime = add(f32([0, 0.5, 1])), vMove = add(f32([0, 0, 0, 0, 0.2, 0, 0, 0, 0])), vPng = add(PNG);
  const json = {
    asset: { version: '2.0', generator: 'cdda-voxel-studio test fixture' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Body', mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0 } }],
    textures: [{ source: 0 }],
    images: [{ bufferView: vPng, mimeType: 'image/png' }],
    accessors: [
      { bufferView: vPos, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: [-w / 2, 0, -d / 2], max: [w / 2, h, d / 2] },
      { bufferView: vNrm, componentType: 5126, count: nrm.length / 3, type: 'VEC3' },
      { bufferView: vUv, componentType: 5126, count: uv.length / 2, type: 'VEC2' },
      { bufferView: vIdx, componentType: 5123, count: idx.length, type: 'SCALAR' },
      { bufferView: vTime, componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [1] },
      { bufferView: vMove, componentType: 5126, count: 3, type: 'VEC3' },
    ],
    animations: [{ name: 'Idle', samplers: [{ input: 4, output: 5, interpolation: 'LINEAR' }], channels: [{ sampler: 0, target: { node: 0, path: 'translation' } }] }],
    bufferViews: views,
    buffers: [{ byteLength: offset }],
  };
  const bin = Buffer.concat(parts);
  let text = Buffer.from(JSON.stringify(json));
  text = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const chunk = (type: number, body: Buffer) => {
    const head = Buffer.alloc(8);
    head.writeUInt32LE(body.length, 0);
    head.writeUInt32LE(type, 4);
    return Buffer.concat([head, body]);
  };
  const body = Buffer.concat([chunk(0x4e4f534a, text), chunk(0x004e4942, bin)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + body.length, 8);
  return Buffer.concat([header, body]);
}

/** A unit cube standing on the ground, with a red material from crate.mtl. */
export function crateObj(): string {
  const v = [[-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5], [-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]];
  const f = [[1, 2, 3, 4], [5, 8, 7, 6], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 8, 4], [5, 1, 4, 8]];
  return ['mtllib crate.mtl', 'o Crate', ...v.map((p) => `v ${p.join(' ')}`), 'usemtl red', ...f.map((q) => `f ${[...q].reverse().join(' ')}`), ''].join('\n');
}

export const MESH_FIXTURE = 'test-fixture';

/** Write the fixture set; returns a function that removes it. */
export function writeMeshFixture(root = 'vendor/mesh'): () => void {
  const dir = join(root, MESH_FIXTURE);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'box.glb'), boxGlb(1, 2, 0.5));
  writeFileSync(join(dir, 'crate.obj'), crateObj());
  writeFileSync(join(dir, 'crate.mtl'), 'newmtl red\nKd 0.8 0.1 0.1\n');
  writeFileSync(join(dir, 'meshset.json'), JSON.stringify({
    name: 'Test meshes',
    models: [
      { id: 'f_crate_c', file: 'box.glb', fit: 0.8, animations: { idle: 'Idle', walk: 'Walk' } },
      { id: 'f_crate_wood_test', file: 'crate.obj', height: 0.5 },
    ],
  }, null, 2));
  return () => rmSync(dir, { recursive: true, force: true });
}
