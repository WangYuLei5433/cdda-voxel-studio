// A whole-vehicle model's cabin parts (seats, controls, dashboard…), placed inside it by the
// vehicle's CDDA part layout. The mesh set names its rules in meshset.json ("vehicleParts": a JSON
// file in the set, cdda-cubeclysm-3d's models/cubeclysm/vehicles/variants.json); the layouts come
// from public/data/cdda/<version>/vehicle-layouts.json (tools/editor/catalog.mjs --layouts).
import * as THREE from 'three';

import { buildMesh, fileUrl, type LoadedMeshSet } from './library';
import { meshEntryFiles } from './meshset';

/** [mount x (forward), mount y (right), "part#variant"]. */
export type LayoutPart = [number, number, string];
export type VehicleLayouts = Record<string, LayoutPart[]>;

type Side = 'N' | 'S' | 'W' | 'E';
/** [model id, side, ...flags]; a flag may be followed by its value ('slide', 0.125). */
type Rule = [string, string, ...(string | number)[]];

export interface VehicleParts {
  tile: number;
  rotation: Record<Side, number>;
  paint?: { material: string };
  handed?: string[];
  tall?: string[];
  corners?: Record<string, string>;
  skipRoof?: string[];
  /** Cabin parts a whole-vehicle model shows inside its shell. */
  interior?: string[];
  heights?: { floor?: number };
  parts: Record<string, { default?: Rule[]; variants?: Record<string, Rule[]>; spanRow?: boolean }>;
}

interface Placed {
  model: string;
  x: number;
  z: number;
  rotY: number;
  mirror: boolean;
  key: string;
  row: number;
  side?: string;
  edges?: string[];
  mid?: boolean;
  ifEmpty?: boolean;
  engineRow?: boolean;
}

const PANELS = ['board', 'halfboard', 'hdboard', 'hdhalfboard', 'door', 'door_trunk'];
const CORNER_OF: Record<string, Side> = { NW: 'N', NE: 'E', SW: 'W', SE: 'S' };

/** Where every part model of the layout goes (vehicle space: front −Z, metres). */
export function placeParts(layout: LayoutPart[], vp: VehicleParts, has: (model: string) => boolean): { placed: Placed[]; missing: Set<string> } {
  const base = (q: string) => q.split('#')[0];
  const tiles: LayoutPart[] = [...layout];
  const occ = new Set(tiles.filter(([, , q]) => /frame/.test(base(q))).map(([x, y]) => `${x},${y}`));
  // spanRow: roofs reach sideways over tiles with body panels.
  const roofOf = new Map(tiles.filter(([, , q]) => vp.parts[base(q)]?.spanRow).map(([x, y, q]) => [`${x},${y}`, base(q)]));
  const hasPanel = (x: number, y: number) => tiles.some(([a, b, q]) => a === x && b === y && PANELS.includes(base(q)));
  for (const [k, r] of [...roofOf]) {
    const [x, y] = k.split(',').map(Number);
    for (const d of [-1, 1]) for (let yy = y + d; hasPanel(x, yy) && !roofOf.has(`${x},${yy}`); yy += d) { roofOf.set(`${x},${yy}`, r); tiles.push([x, yy, r]); }
  }
  const T = vp.tile, R = vp.rotation;
  let placed: Placed[] = [];
  const missing = new Set<string>();
  for (const [x, y, q] of tiles) {
    const [b0, v0 = ''] = q.split('#');
    const part = b0.replace(/_or$/, ''), variant = v0.replace(/^full_/, '');
    const def = vp.parts[part];
    const list: Rule[] = def ? (def.variants?.[variant] ?? def.default ?? []) : [[`vp_${part}`, 'N']];
    const open: Record<Side, boolean> = { N: !occ.has(`${x + 1},${y}`), S: !occ.has(`${x - 1},${y}`), W: !occ.has(`${x},${y - 1}`), E: !occ.has(`${x},${y + 1}`) };
    for (const [model, side, ...flags] of list) {
      if (!has(model)) { missing.add(model); continue; }
      const pos = { x: y * T, z: -x * T, key: `${x},${y}`, row: x };
      let sides: string[] = [side];
      if (side === 'out') sides = (['N', 'S', 'W', 'E'] as Side[]).filter((s) => open[s]);
      if (side === 'outNS') sides = open.N && !open.S ? ['N'] : open.S && !open.N ? ['S'] : ['mid'];
      if (side === 'outWE') sides = open.W && !open.E ? ['W'] : open.E && !open.W ? ['E'] : ['mid'];
      const resolved = side.startsWith('out');
      const si = flags.indexOf('slide');
      const slide = si >= 0 ? Number(flags[si + 1]) : 0;
      const ifEmpty = flags.includes('ifEmptyAbove'), engineRow = flags.includes('engineRow');
      const cm = vp.corners?.[model];
      if (cm && side === 'out') {
        for (const [c, rot] of Object.entries(CORNER_OF)) {
          if (!sides.includes(c[0]) || !sides.includes(c[1])) continue;
          placed.push({ ...pos, model: has(cm) ? cm : model, rotY: R[rot], mirror: false, side: c, edges: [c[0], c[1]], ifEmpty });
          sides = sides.filter((s) => s !== c[0] && s !== c[1]);
        }
      }
      if (cm && side === 'top' && has(cm)) {
        const c = Object.keys(CORNER_OF).find((k) => open[k[0] as Side] && open[k[1] as Side]);
        if (c) { placed.push({ ...pos, model: cm, rotY: R[CORNER_OF[c]], mirror: false, side: 'top', engineRow }); continue; }
      }
      for (const s of sides) {
        const mirror = flags.includes('mirror') || (resolved && (vp.handed ?? []).includes(model) && s === 'E');
        if (slide) { placed.push({ ...pos, model, x: pos.x + (s === 'W' ? -slide : s === 'E' ? slide : 0), rotY: 0, mirror }); continue; }
        placed.push({ ...pos, model, rotY: s === 'top' || s === 'mid' ? 0 : R[s as Side], mirror, side: s, mid: s === 'mid', ifEmpty, engineRow, edges: [s] });
      }
    }
  }
  // skipRoof: tiles topped by raked glass get no roof (or roof edges).
  const raked = new Set(placed.filter((p) => (vp.skipRoof ?? []).includes(p.model) && !p.mid).map((p) => p.key));
  placed = placed.filter((p) => !(/^vp_(hd)?roof/.test(p.model) && raked.has(p.key)));
  // engineRow: only in a row that has a hood of its own.
  const hoodRows = new Set(placed.filter((p) => /^vp_hood/.test(p.model) && !p.engineRow).map((p) => p.row));
  placed = placed.filter((p) => !p.engineRow || hoodRows.has(p.row));
  // ifEmptyAbove: not where a tall model already stands on that tile edge.
  const cornerEdges: Record<number, string> = { [R.N]: 'NW', [R.E]: 'NE', [R.W]: 'SW', [R.S]: 'SE' };
  const tall = new Set(placed.filter((p) => (vp.tall ?? []).includes(p.model) && !p.ifEmpty).flatMap((p) => {
    const e = /corner/.test(p.model) ? (cornerEdges[p.rotY] ?? '').split('') : p.side ? [p.side] : [];
    return e.map((s) => `${p.key}|${s}`);
  }));
  placed = placed.filter((p) => !p.ifEmpty || !(p.edges ?? []).some((s) => tall.has(`${p.key}|${s}`)));
  return { placed, missing };
}

/** A whole-vehicle model's cabin (meshset entry field `interior`). */
export interface VehicleInterior {
  /** Cabin floor height, metres. */
  floor: number;
  /** The shell's length and width, metres: the layout's tiles are spread over them. */
  length: number;
  width: number;
}

/**
 * The cabin parts (vp.interior) of a vehicle's layout, placed inside a whole-vehicle shell: the
 * layout's frame tiles spread evenly over the shell's length and width, the parts standing on its
 * cabin floor. Origin = the shell's centre on the ground, front −Z.
 */
export async function assembleInterior(set: LoadedMeshSet, vp: VehicleParts, layout: LayoutPart[], interior: VehicleInterior): Promise<{ object: THREE.Object3D; placed: number }> {
  const files = new Map<string, string>();
  for (const e of set.set.models) for (const id of [e.id ?? []].flat()) if (!files.has(id) && meshEntryFiles(e)[0]) files.set(id, meshEntryFiles(e)[0]);
  const wanted = new Set(vp.interior ?? []);
  const { placed } = placeParts(layout, vp, (m) => wanted.has(m) && files.has(m));
  const frame = layout.filter(([, , q]) => /frame/.test(q.split('#')[0]));
  const xs = (frame.length ? frame : layout).map(([x]) => x), ys = (frame.length ? frame : layout).map(([, y]) => y);
  const along = interior.length / (Math.max(...xs) - Math.min(...xs) + 1), across = interior.width / (Math.max(...ys) - Math.min(...ys) + 1);
  const mx = (Math.min(...xs) + Math.max(...xs)) / 2, my = (Math.min(...ys) + Math.max(...ys)) / 2;
  const lift = interior.floor - (vp.heights?.floor ?? .3);
  const root = new THREE.Group();
  root.name = 'interior';
  const built = await Promise.all(placed.map(async (p) => {
    const b = await buildMesh(fileUrl(set.base, files.get(p.model)!), { preserveOrigin: true });
    if (p.mirror) b.object.scale.x = -1;
    const g = new THREE.Group();
    // Mounts: p.x = y × tile, p.z = −x × tile.
    const my0 = p.x / vp.tile, mx0 = -p.z / vp.tile;
    g.position.set((my0 - my) * across, lift, -(mx0 - mx) * along);
    g.rotation.y = (p.rotY * Math.PI) / 180;
    g.add(b.object);
    return g;
  }));
  for (const g of built) root.add(g);
  return { object: root, placed: placed.length };
}
