import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { matches, search, type CatalogEntry } from '../../src/editor/catalog';
import { buildCatalog } from '../../tools/editor/catalog.mjs';

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

describe('CDDA catalog', () => {
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
