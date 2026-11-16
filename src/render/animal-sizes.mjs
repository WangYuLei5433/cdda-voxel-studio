// Visual reference heights in the metric world (person = 1.8). Keep body/antler
// height distinct from horizontal tile fit, especially for dogs and long-necked birds.
export const ANIMAL_HEIGHTS = {
  cow: 1.45, calf: .8, bull: 1.65, deer: 1.7, fawn: .85, pig: .8, piglet: .25,
  sheep: .9, lamb: .4, chicken: .4, chick: .1, turkey: .65, poult: .2,
  rabbit: .3, raccoon: .35, rat: .12, mouse: .065,
  dog: .65, puppy: .3, cat: .32, kitten: .18, wolf: .85, fox: .45,
  horse: 1.75, pony: 1.25, moose: 2.1, elk: 1.9, bear: 1.35,
  goose: .55, duck: .35, crow: .25, pigeon: .22, goat: .8,
};
export function naturalAnimalHeight(id, size = 3) {
  const young = { mon_cow_calf: 'calf', mon_deer_fawn: 'fawn', mon_pig_piglet: 'piglet', mon_sheep_lamb: 'lamb', mon_chicken_chick: 'chick', mon_turkey_chick: 'poult', mon_turkey_domestic_chick: 'poult' };
  const name = young[id] ?? id.replace(/^mon_/, '');
  const family = Object.keys(ANIMAL_HEIGHTS).find((s) => name === s || name.startsWith(`${s}_`));
  return family ? ANIMAL_HEIGHTS[family] : [.08, .08, .35, .75, 1.4, 2.2][Math.max(1, Math.min(5, size))];
}
