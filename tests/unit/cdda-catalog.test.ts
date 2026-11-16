import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { inherit, parseUnits } from '../../tools/editor/catalog.mjs';

describe('CDDA units', () => {
  it('reads volumes, masses and lengths in their base units', () => {
    expect(parseUnits('250 ml', 'volume')).toBe(250);
    expect(parseUnits('1 L 250 ml', 'volume')).toBe(1250);
    expect(parseUnits('2.5 kg', 'mass')).toBe(2500);
    expect(parseUnits('30 cm', 'length')).toBe(300);
    expect(parseUnits(40, 'mass')).toBe(40);
    expect(parseUnits('5 parsecs', 'length')).toBeNull();
  });
});

describe('copy-from inheritance', () => {
  const parent = { id: 'p', abstract: 'p', name: { str: 'base' }, volume: 1000, weight: 500, damage: { amount: 10, armor_penetration: 2 }, flags: ['A', 'B'], price: 100 };
  it('child fields replace, ids and instructions are not inherited', () => {
    const r = inherit(parent, { id: 'c', name: { str: 'child' } });
    expect(r).toMatchObject({ id: 'c', name: { str: 'child' }, volume: 1000 });
    expect(r).not.toHaveProperty('abstract');
  });
  it('relative and proportional change the parent value, units and objects included', () => {
    const r = inherit(parent, { id: 'c', relative: { volume: '250 ml', damage: { amount: -2 } }, proportional: { price: 0.7, weight: 2 } });
    expect(r).toMatchObject({ volume: 1250, weight: 1000, price: 70, damage: { amount: 8, armor_penetration: 2 } });
    expect(r).not.toHaveProperty('relative');
  });
  it('extend appends and delete removes list members', () => {
    expect(inherit(parent, { id: 'c', extend: { flags: ['C'] }, delete: { flags: ['A'] } }).flags).toEqual(['B', 'C']);
  });
});

describe('generated catalog', () => {
  const index = 'public/data/cdda/index.json';
  it.skipIf(!existsSync(index))('lists versions whose catalog files exist and match their counts', () => {
    const { versions } = JSON.parse(readFileSync(index, 'utf8')) as { versions: { path: string; counts: Record<string, number> }[] };
    expect(versions.length).toBeGreaterThan(0);
    for (const v of versions) {
      const c = JSON.parse(readFileSync(`public/data/cdda/${v.path}`, 'utf8'));
      for (const [kind, n] of Object.entries(v.counts)) expect(c[kind].length).toBe(n);
      const zombie = c.monster.find((m: { id: string }) => m.id === 'mon_zombie');
      expect(zombie).toMatchObject({ body: 'human', volume: 62500 });
    }
  });
});
