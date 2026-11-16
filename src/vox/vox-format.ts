// MagicaVoxel .vox files, read the way cataclysm-3d reads them (src/voxel_vox.cpp there):
// the first model only, palette entry i of the RGBA chunk is color index i + 1, and a color
// is glass when its alpha is below 250 or its MATL material is _glass / _blend.
// https://github.com/ephtracy/voxel-model/blob/master/MagicaVoxel-file-format-vox.txt

export interface VoxModel {
  /** Size in voxels: x (east), y (north), z (up), MagicaVoxel axes. */
  size: [number, number, number];
  /** x, y, z, color index, four bytes per voxel. */
  voxels: Uint8Array;
  /** 0xRRGGBB per color index (index 0 unused). */
  palette: Uint32Array;
  /** Glass (translucent) color indices. */
  glass: boolean[];
  /** How many models the file holds (only the first is used). */
  modelCount: number;
}

/** Palette used when a file has none: a grey ramp, as cataclysm-3d does. */
function defaultPalette(): Uint32Array {
  const p = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const v = 255 - (i % 64) * 3;
    p[i] = (v << 16) | (v << 8) | v;
  }
  return p;
}

export function readVox(buffer: ArrayBuffer): VoxModel {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const tag = (at: number) => String.fromCharCode(bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]);
  if (bytes.length < 8 || tag(0) !== 'VOX ') throw new Error('not a MagicaVoxel file');
  let pos = 8;
  let size: [number, number, number] | null = null;
  let voxels: Uint8Array | null = null;
  let modelCount = 0;
  let palette: Uint32Array | null = null;
  const glass = new Array<boolean>(256).fill(false);
  const u32 = (at: number) => view.getUint32(at, true);
  const str = (at: number): [string, number] => {
    const n = u32(at);
    return [new TextDecoder().decode(bytes.subarray(at + 4, at + 4 + n)), at + 4 + n];
  };
  while (pos + 12 <= bytes.length) {
    const id = tag(pos);
    const content = u32(pos + 4);
    pos += 12;
    if (id === 'MAIN') continue;
    if (pos + content > bytes.length) break;
    const end = pos + content;
    if (id === 'SIZE') {
      if (!size) size = [u32(pos), u32(pos + 4), u32(pos + 8)];
    } else if (id === 'XYZI') {
      modelCount++;
      if (!voxels) {
        const n = Math.min(u32(pos), Math.floor((content - 4) / 4));
        voxels = bytes.slice(pos + 4, pos + 4 + n * 4);
      }
    } else if (id === 'RGBA') {
      palette = new Uint32Array(256);
      for (let i = 0; i < 256 && pos + i * 4 + 4 <= end; i++) {
        const o = pos + i * 4;
        palette[(i + 1) & 0xff] = (bytes[o] << 16) | (bytes[o + 1] << 8) | bytes[o + 2];
        if (bytes[o + 3] < 250) glass[(i + 1) & 0xff] = true;
      }
    } else if (id === 'MATL') {
      const mat = u32(pos);
      const pairs = u32(pos + 4);
      let at = pos + 8;
      for (let i = 0; i < pairs && at < end; i++) {
        const [key, next] = str(at);
        const [value, after] = str(next);
        at = after;
        if (key === '_type' && (value === '_glass' || value === '_blend') && mat < 256) glass[mat] = true;
      }
    }
    pos = end;
  }
  if (!size || !voxels || size.some((s) => s <= 0)) throw new Error('no voxel model in the file');
  return { size, voxels, palette: palette ?? defaultPalette(), glass, modelCount };
}

/** A .vox file with one model; glass colors get alpha 128 (read back as glass). */
export function writeVox(model: Pick<VoxModel, 'size' | 'voxels' | 'palette' | 'glass'>): ArrayBuffer {
  const chunk = (id: string, content: Uint8Array) => {
    const out = new Uint8Array(12 + content.length);
    const v = new DataView(out.buffer);
    for (let i = 0; i < 4; i++) out[i] = id.charCodeAt(i);
    v.setUint32(4, content.length, true);
    v.setUint32(8, 0, true);
    out.set(content, 12);
    return out;
  };
  const sizeBytes = new Uint8Array(12);
  model.size.forEach((s, i) => new DataView(sizeBytes.buffer).setUint32(i * 4, s, true));
  const n = model.voxels.length / 4;
  const xyzi = new Uint8Array(4 + n * 4);
  new DataView(xyzi.buffer).setUint32(0, n, true);
  xyzi.set(model.voxels.subarray(0, n * 4), 4);
  const rgba = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const index = (i + 1) & 0xff;
    const c = model.palette[index] ?? 0;
    rgba.set([(c >> 16) & 0xff, (c >> 8) & 0xff, c & 0xff, model.glass[index] ? 128 : 255], i * 4);
  }
  const children = [chunk('SIZE', sizeBytes), chunk('XYZI', xyzi), chunk('RGBA', rgba)];
  const body = new Uint8Array(children.reduce((a, c) => a + c.length, 0));
  let at = 0;
  for (const c of children) {
    body.set(c, at);
    at += c.length;
  }
  const out = new Uint8Array(8 + 12 + body.length);
  const v = new DataView(out.buffer);
  out.set([86, 79, 88, 32], 0); // "VOX "
  v.setUint32(4, 150, true);
  out.set([77, 65, 73, 78], 8); // "MAIN"
  v.setUint32(12, 0, true);
  v.setUint32(16, body.length, true);
  out.set(body, 20);
  return out.buffer;
}
