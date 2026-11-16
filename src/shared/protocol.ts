// The terrain / furniture record the classifiers read (subset of the game's catalog types).
export interface CatalogFeature {
  id: string;
  name: string;
  sym: string;
  color: string;
  move: number;
  looksLike: string;
  flags: string[];
}
