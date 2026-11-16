// World proportions, cataclysm-3d's voxel scale: one tile is one unit (a metre) across,
// 8 voxels per tile; a z-level is 16 voxels (2 tiles) high and a person about 13 voxels.
export const VOXELS_PER_TILE = 8;

export const WORLD = {
  /** Wall height (one z-level) in tiles. */
  wallHeight: 16 / VOXELS_PER_TILE,
  /** A grown person's height in tiles. */
  personHeight: 13 / VOXELS_PER_TILE,
};
