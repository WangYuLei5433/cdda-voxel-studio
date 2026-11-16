// How a monster is shown: which model and at what size. Shared by the game's creature layer
// and the model editor, so the editor shows exactly what the game does.
import type { Appearance, Describable } from './appearance';
import { colorOf } from './classify';
import { t } from '../editor/i18n';
import type { ModelInstance, ModelLibrary } from './models';
import { legacyCreatureScale } from './world-scale';
import { WORLD } from './world-scale';
import * as THREE from 'three';
import { naturalAnimalHeight } from './animal-sizes.mjs';

/** What the plan needs to know about a monster type (catalog monster entry). */
export interface MonsterInfo extends Describable {
  species: string[];
  body: string;
  /** Creature size class (1 tiny … 5 huge). */
  size: number;
  color?: string;
}

export type MonsterPlan =
  /** A model from the appearance registry, scaled by the creature's size. */
  | { kind: 'model'; key: string; tint?: number; extra: number; scale: [number, number, number]; source: string; height?: number }
  /** No model: the game's capsule placeholder. */
  | { kind: 'placeholder'; scale: [number, number, number]; source: string };

/**
 * The plan for monster `mon`; `seed` (the creature id) picks among variants the same way
 * for the same creature.
 */
export function planMonster(mon: MonsterInfo, seed: number, appearance: Appearance): MonsterPlan {
  const legacy = (0.7 + mon.size * 0.15) * legacyCreatureScale();
  const natural = mon.body !== 'human' && mon.species.some((s) => s === 'MAMMAL' || s === 'BIRD') && !mon.species.some((s) => ['ZOMBIE', 'NETHER', 'ROBOT'].includes(s)) && !/mutant|giant|thing|horror|chimera|skeletal|rat_king/.test(mon.id);
  const animalHeight = natural ? naturalAnimalHeight(mon.id, mon.size) * WORLD.personHeight / 1.8 : undefined;
  const chosen = appearance.explain('monster', mon);
  if (chosen.via === 'override' && chosen.resolved) {
    const r = chosen.resolved;
    return { kind: 'model', key: r.model, tint: r.tint ? colorOf(mon.color) : undefined, extra: r.scale, scale: natural ? [1, 1, 1] : [legacy, legacy, legacy], ...(animalHeight ? { height: animalHeight * r.scale } : {}), source: t('本地覆盖 · 模型 {key}', { key: r.model }) };
  }
  const r = appearance.resolve('monster', mon, seed);
  if (r) {
    return { kind: 'model', key: r.model, tint: r.tint ? colorOf(mon.color) : undefined, extra: r.scale,
      scale: natural ? [1, 1, 1] : [legacy, legacy, legacy],
      ...(animalHeight ? { height: animalHeight * r.scale } : {}), source: t('模型 {key}', { key: r.model }) };
  }
  return { kind: 'placeholder', scale: [legacy, legacy, legacy], source: t('无模型（占位胶囊）') };
}

/** Build the model a plan names (null for the placeholder or a missing model). */
export async function buildMonster(plan: MonsterPlan, models: ModelLibrary): Promise<ModelInstance | null> {
  if (plan.kind === 'model') {
    const model = await models.instantiate(plan.key, plan.tint, plan.extra);
    if (model && plan.height) {
      model.object.updateMatrixWorld(true);
      const size = new THREE.Box3().setFromObject(model.object, true).getSize(new THREE.Vector3());
      const scale = plan.height / Math.max(size.y, .001);
      model.object.scale.multiplyScalar(scale); model.object.position.multiplyScalar(scale);
      model.object.updateMatrixWorld(true);
      const object = new THREE.Group(); object.add(model.object);
      return { object, play: (role, once) => model.play(role, once), update: (dt) => model.update(dt), ...(model.freezeDeath ? { freezeDeath: () => model.freezeDeath!() } : {}) };
    }
    return model;
  }
  return null;
}
