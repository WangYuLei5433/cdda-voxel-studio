// World proportions. One tile is one unit horizontally; heights follow the wall height.
// The default (CC0 asset) world keeps its compact look; the metric world uses real sizes:
// walls 2.45 m and people 1.8 m, so real-size models stand in the right proportion.
export const WORLD = {
  /** Wall height in tiles. */
  wallHeight: 1.4,
  /** A grown person's height in tiles. */
  personHeight: 0.95,
};

const DEFAULT = { ...WORLD };

/** Switch to metric proportions (call before the scene is built). */
export function useMetricWorld(metric: boolean): void {
  Object.assign(WORLD, metric ? { wallHeight: 2.45, personHeight: 1.8 } : DEFAULT);
}

/** Scale for models made for the default world (people 0.95 tall) shown in the current one. */
export function legacyCreatureScale(): number {
  return WORLD.personHeight / DEFAULT.personHeight;
}
