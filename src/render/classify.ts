// Map catalog entries to render kinds + colors. Pure data → used by the scene and by the
// appearance registry (src/render/appearance.ts) which can override per id with models.
import type { CatalogFeature } from '../shared/protocol';

export type TerrainKind =
  | 'none'
  | 'floor'
  | 'wall'
  | 'door'
  | 'door_open'
  | 'window'
  | 'tree'
  | 'shrub'
  | 'water'
  | 'stairs_up'
  | 'stairs_down'
  | 'open_air'
  | 'rubble';

export type FurnitureKind = 'none' | 'block' | 'low' | 'door' | 'door_open' | 'window';

// CDDA curses colors (data/raw/colors.json) → hex.
const NAMED: Record<string, number> = {
  black: 0x1a1a1a,
  red: 0xc23b22,
  green: 0x3f7d3a,
  brown: 0x7a5230,
  blue: 0x3355cc,
  magenta: 0x8b3a62,
  cyan: 0x2a9bb0,
  light_gray: 0x9a9a9a,
  dark_gray: 0x5a5a5a,
  light_red: 0xe08080,
  light_green: 0x6fbf5f,
  yellow: 0xd8c040,
  light_blue: 0x7f8fff,
  pink: 0xe070c0,
  light_cyan: 0x60d0e0,
  white: 0xe8e8e8,
};

/** CDDA color names look like "c_light_gray", "i_red" (inverted), "h_" (highlighted). */
export function colorOf(name: string | undefined): number {
  if (!name) return NAMED.light_gray;
  const base = name.replace(/^[a-z]_/, '').replace(/_(black|white|red|green|yellow|blue|magenta|cyan)$/, '');
  return NAMED[base] ?? NAMED.light_gray;
}

const has = (f: CatalogFeature, flag: string) => f.flags.includes(flag);
const isOpenDoorId = (id: string) => /door.*_o$|_open$|door_o\b|open_door/.test(id);

export function terrainKind(f: CatalogFeature | undefined): TerrainKind {
  if (!f || f.id === 't_null') return 'none';
  const id = f.id;
  if (has(f, 'NO_FLOOR') || id === 't_open_air') return 'open_air';
  if (has(f, 'GOES_UP')) return 'stairs_up';
  if (has(f, 'GOES_DOWN')) return 'stairs_down';
  if (has(f, 'DOOR') || /door|gate/.test(id)) {
    if (isOpenDoorId(id) || (f.move > 0 && !has(f, 'WALL'))) return 'door_open';
    return 'door';
  }
  if (has(f, 'WINDOW') || /window/.test(id)) return 'window';
  if (has(f, 'TREE')) return 'tree';
  if (has(f, 'SHRUB') || has(f, 'YOUNG')) return 'shrub';
  if (has(f, 'LIQUID') || has(f, 'SWIMMABLE') || /water/.test(id)) return 'water';
  if (has(f, 'WALL') || has(f, 'CONNECT_WITH_WALL') || f.move === 0) return 'wall';
  if (/rubble|debris/.test(id)) return 'rubble';
  return 'floor';
}

export function furnitureKind(f: CatalogFeature | undefined): FurnitureKind {
  if (!f || f.id === 'f_null') return 'none';
  // Utility furniture with a blank symbol (gas vents, fog sources, markers) is not meant to be seen.
  if (f.sym === ' ' || f.sym === '') return 'none';
  if (/door|gate/.test(f.id)) return isOpenDoorId(f.id) ? 'door_open' : 'door';
  if (/window|curtain/.test(f.id)) return 'window';
  if (f.move === 0 || has(f, 'BLOCKSDOOR')) return 'block';
  return 'low';
}

/** lit_level (lightmap.h) → brightness multiplier. */
export function litBrightness(lit: number, visible: boolean): number {
  // Out of sight: drawn at normal brightness; the fog-of-war veil grays it out.
  if (!visible) return 0.9;
  switch (lit) {
    case 0: return 0.45; // DARK (seen via night vision etc.)
    case 1: return 0.65; // LOW
    case 2: return 0.8; // BRIGHT_ONLY
    case 3: return 1.0; // LIT
    case 4: return 1.1; // BRIGHT
    default: return 0.9;
  }
}
