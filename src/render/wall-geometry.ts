// Walls with thickness. A CDDA wall fills a tile; drawing it as a 1×1 block makes walls a
// tile thick next to thin doors and windows. Instead each wall tile is a thin post at the
// tile centre plus an arm toward every neighbour that is part of the wall line (wall, door,
// window), so straight runs, corners, T and cross junctions join up. Doors and window
// frames use the same thickness.
import * as THREE from 'three';

/** Wall thickness in tiles (about 20 cm in the metric world). */
export const WALL_THICKNESS = 0.2;

export type WallPart = 'post' | 'armPos' | 'armNeg';

/** Which neighbours continue the wall line: east (+x), west (−x), south (+z), north (−z). */
export interface WallLinks {
  e: boolean;
  w: boolean;
  s: boolean;
  n: boolean;
}

export interface WallPiece {
  part: WallPart;
  /** Rotation about Y: 0 → the arm runs along x; −π/2 → along z. */
  rotY: number;
  /**
   * World directions the piece's two long faces (BoxGeometry material slots 4 = local +z,
   * 5 = local −z) look toward, for choosing interior / exterior textures.
   */
  faces: [Dir, Dir];
}

export type Dir = 'e' | 'w' | 's' | 'n';

/** Pieces for a wall tile from its links. A lone wall runs east–west. */
export function wallPieces(links: WallLinks, pillar = false): WallPiece[] {
  if (pillar) return [{ part: 'post', rotY: 0, faces: ['s', 'n'] }];
  const along = { x: links.e || links.w, z: links.n || links.s };
  const lone = !along.x && !along.z;
  const pieces: WallPiece[] = [{ part: 'post', rotY: 0, faces: ['s', 'n'] }];
  // Along x (rotY 0): local +z faces south, −z north.
  if (links.e || lone) pieces.push({ part: 'armPos', rotY: 0, faces: ['s', 'n'] });
  if (links.w || lone) pieces.push({ part: 'armNeg', rotY: 0, faces: ['s', 'n'] });
  // Along z (rotY −π/2: local +x → world +z, local +z → world −x).
  if (links.s) pieces.push({ part: 'armPos', rotY: -Math.PI / 2, faces: ['w', 'e'] });
  if (links.n) pieces.push({ part: 'armNeg', rotY: -Math.PI / 2, faces: ['w', 'e'] });
  return pieces;
}

/** Remap the u coordinate of one box face (4 vertices) from [0, 1] to [u0, u1]. */
function remapFaceU(geometry: THREE.BufferGeometry, face: number, u0: number, u1: number): void {
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  for (let i = face * 4; i < face * 4 + 4; i++) uv.setX(i, u0 + uv.getX(i) * (u1 - u0));
}

/**
 * Geometry for one wall part, `height` tall, standing on y = 0 at the tile centre.
 * Arms run from the centre to the tile edge (+x for armPos, −x for armNeg); their long faces
 * take the matching half of a one-tile wall texture, so a straight run shows it whole.
 */
export function wallPartGeometry(part: WallPart, height: number, thickness = WALL_THICKNESS): THREE.BufferGeometry {
  if (part === 'post') {
    // Slightly inset so its faces never coincide with an arm's (no z-fighting).
    const t = thickness * 0.98;
    const g = new THREE.BoxGeometry(t, height, t);
    for (const face of [0, 1, 4, 5]) remapFaceU(g, face, 0.5 - t / 2, 0.5 + t / 2);
    return g.translate(0, height / 2, 0);
  }
  const g = new THREE.BoxGeometry(0.5, height, thickness);
  const positive = part === 'armPos';
  // Slot 4 (+z) reads left→right along +x; slot 5 (−z) is mirrored.
  remapFaceU(g, 4, positive ? 0.5 : 0, positive ? 1 : 0.5);
  remapFaceU(g, 5, positive ? 0 : 0.5, positive ? 0.5 : 1);
  for (const face of [0, 1]) remapFaceU(g, face, 0.5 - thickness / 2, 0.5 + thickness / 2);
  return g.translate(positive ? 0.25 : -0.25, height / 2, 0);
}
