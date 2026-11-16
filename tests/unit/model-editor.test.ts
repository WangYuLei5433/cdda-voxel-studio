import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { matches, search, type CatalogEntry } from '../../src/editor/catalog';
import { editedObjects, emptyDoc, readEdit, removeEdit, writeEdit, type Edit } from '../../src/editor/overrides';
import { Appearance, type AppearanceDoc } from '../../src/render/appearance';
import { buildCatalog } from '../../tools/editor/catalog.mjs';
import { validateOverrides } from '../../tools/editor/vite-plugin.mjs';

const base: AppearanceDoc = {
  models: {
    chair: { url: '/assets/models/chair.glb', fit: 0.6 },
    stool: { url: '/assets/models/stool.glb', fit: 0.5, rotY: 0.5 },
    f_bench: { url: '/assets/models/bench.glb' },
  },
  rules: [{ kind: 'furn', id: 'chair|stool', model: 'chair' }],
};

function appearanceWith(...docs: AppearanceDoc[]): Appearance {
  const a = new Appearance();
  for (const d of [base, ...docs]) a.merge(d);
  return a;
}

const edit = (patch: Partial<Edit> = {}): Edit => ({ model: 'stool', scale: 1, rotY: 0, y: 0, lieFlat: false, tint: false, ...patch });

describe('model editor overrides', () => {
  it('stores a model swap as an exact-id override rule and reads it back', () => {
    const doc = writeEdit(emptyDoc(), 'furn', 'f_chair', edit({ scale: 1.5, tint: true }), base.models!.stool);
    expect(doc.rules).toEqual([{ kind: 'furn', id: '^f_chair$', model: 'stool', scale: 1.5, tint: true, override: true }]);
    expect(Object.keys(doc.models)).toEqual([]);
    expect(readEdit(doc, 'furn', 'f_chair')).toEqual(edit({ scale: 1.5, tint: true }));
    expect(editedObjects(doc)).toEqual(new Set(['furn:f_chair']));
  });

  it('keeps placement changes on a copy of the model, so other users of it are untouched', () => {
    const doc = writeEdit(emptyDoc(), 'furn', 'f_chair', edit({ rotY: 90, y: 0.1, lieFlat: true }), base.models!.stool);
    const derived = doc.models['edit:furn:f_chair'];
    expect(derived.url).toBe('/assets/models/stool.glb');
    expect(derived.rotY).toBeCloseTo(0.5 + Math.PI / 2);
    expect(readEdit(doc, 'furn', 'f_chair')).toEqual(edit({ rotY: 90, y: 0.1, lieFlat: true }));
    const a = appearanceWith(doc as AppearanceDoc);
    expect(a.resolve('furn', { id: 'f_chair' })?.model).toBe('edit:furn:f_chair');
    expect(a.resolve('furn', { id: 'f_stool' })?.model).toBe('chair');
    expect(a.model('stool')?.rotY).toBe(0.5);
  });

  it('replaces an earlier edit and removes it with its derived model', () => {
    let doc = writeEdit(emptyDoc(), 'furn', 'f_chair', edit({ rotY: 180 }), base.models!.stool);
    doc = writeEdit(doc, 'furn', 'f_chair', edit({ model: 'chair' }), base.models!.chair);
    expect(doc.rules).toHaveLength(1);
    expect(doc.models['edit:furn:f_chair']).toBeUndefined();
    expect(removeEdit(doc, 'furn', 'f_chair')).toEqual(emptyDoc());
  });

  it('escapes ids into exact patterns', () => {
    const doc = writeEdit(emptyDoc(), 'item', 'a.b+c', edit(), undefined);
    expect(new RegExp(doc.rules[0].id!).test('a.b+c')).toBe(true);
    expect(new RegExp(doc.rules[0].id!).test('aXb+c')).toBe(false);
    expect(editedObjects(doc)).toEqual(new Set(['item:a.b+c']));
  });
});

describe('appearance resolution order', () => {
  it('editor overrides win over exact ids and rules; explain says which matched', () => {
    const plain = appearanceWith();
    expect(plain.explain('furn', { id: 'f_chair' })).toMatchObject({ via: 'rule', ruleIndex: 0, resolved: { model: 'chair' } });
    expect(plain.explain('furn', { id: 'f_bench' })).toMatchObject({ via: 'exact', resolved: { model: 'f_bench' } });
    expect(plain.explain('furn', { id: 'f_table' })).toMatchObject({ via: 'none', resolved: null });

    const doc = writeEdit(writeEdit(emptyDoc(), 'furn', 'f_bench', edit(), undefined), 'furn', 'f_chair', edit(), undefined);
    const a = appearanceWith(doc as AppearanceDoc);
    expect(a.explain('furn', { id: 'f_bench' })).toMatchObject({ via: 'override', resolved: { model: 'stool' } });
    expect(a.resolve('furn', { id: 'f_chair' })?.model).toBe('stool');
    // Overrides are per kind.
    expect(a.resolve('item', { id: 'f_chair' })).toBeNull();
  });

});

describe('editor search', () => {
  const e = (id: string, name: string, en = name): CatalogEntry => ({ id, name, en, sym: '#', color: 'white', flags: [] });
  const list = [e('f_armchair', '扶手椅', 'armchair'), e('f_chair', '椅子', 'chair'), e('t_wall', '墙', 'wall')];
  it('matches id, Chinese and English names, every word', () => {
    expect(matches(list[0], '扶手')).toBe(true);
    expect(matches(list[0], 'arm chair')).toBe(true);
    expect(matches(list[2], 'chair')).toBe(false);
  });
  it('ranks an exact id first', () => {
    expect(search(list, 'f_chair').map((x) => x.id)).toEqual(['f_chair']);
    expect(search(list, 'chair').map((x) => x.id)).toEqual(['f_armchair', 'f_chair']);
    expect(search(list, 'f_').map((x) => x.id)).toEqual(['f_armchair', 'f_chair']);
  });
});

describe('editor server', () => {
  it('validates override documents', () => {
    expect(validateOverrides({ rules: [{ kind: 'furn', id: '^f_chair$', model: 'chair', scale: 2 }] })).toEqual({
      models: {},
      rules: [{ kind: 'furn', id: '^f_chair$', model: 'chair', scale: 2, override: true }],
    });
    expect(() => validateOverrides({ rules: [{ kind: 'nope', id: 'x', model: 'm' }] })).toThrow(/kind/);
    expect(() => validateOverrides({ rules: [{ kind: 'furn', id: '(', model: 'm' }] })).toThrow(/pattern/);
    expect(() => validateOverrides({ models: { a: { url: '/x.glb', scale: -1 } } })).toThrow(/positive/);
    expect(() => validateOverrides({ models: { a: {} } })).toThrow(/url/);
  });

  const json = 'vendor/cdda/data/json';
  it.skipIf(!existsSync(json))('reads the CDDA catalog with Chinese names and engine fields', () => {
    const c = buildCatalog(json, 'vendor/cdda/lang/mo/zh_CN/LC_MESSAGES/cataclysm-dda.mo') as unknown as Record<string, CatalogEntry[]>;
    const find = (kind: string, id: string) => c[kind].find((x) => x.id === id)!;
    for (const kind of ['ter', 'furn', 'item', 'monster', 'vehicle']) expect(c[kind].length).toBeGreaterThan(100);
    const wall = find('ter', 't_wall');
    expect(wall.flags).toContain('WALL');
    expect(wall.name).not.toBe(wall.en);
    const zombie = find('monster', 'mon_zombie');
    expect(zombie).toMatchObject({ body: 'human', size: 3 });
    expect(zombie.species!).toContain('ZOMBIE');
    // Some monsters write one species as a bare string (mon_nether_cucumber): always a list here.
    expect(c.monster.filter((m) => !Array.isArray(m.species))).toEqual([]);
    expect(find('monster', 'mon_nether_cucumber').species).toEqual(['NETHER']);
    expect(find('item', 'jeans').cat).toBe('clothing');
    expect(find('vehicle', 'car').length).toBeGreaterThan(3);
    // Vehicle parts, fields and traps, and the category names the tree shows.
    for (const kind of ['vpart', 'field', 'trap']) expect(c[kind].length).toBeGreaterThan(50);
    expect(find('vpart', 'wheel')).toMatchObject({ cat: 'movement' });
    expect(find('vpart', 'wheel').flags).toContain('WHEEL');
    expect(find('field', 'fd_fire').name).not.toBe('fd_fire');
    const labels = (c as unknown as { labels: { itemCat: Record<string, string> } }).labels;
    expect(labels.itemCat.clothing).toBe('服装');
  });
});
