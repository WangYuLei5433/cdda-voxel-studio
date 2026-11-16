import { describe, expect, it } from 'vitest';

import type { CatalogEntry, CatalogLabels } from '../../src/editor/catalog';
import { branchOf, buildTree, inBranch, pathOf, trail } from '../../src/editor/tree';

const labels: CatalogLabels = { itemCat: { clothing: '服装', tools: '工具' }, vpartCat: { movement: '移动部件' } };
const entry = (id: string, more: Partial<CatalogEntry> = {}): CatalogEntry => ({ id, name: id, en: id, sym: '?', color: 'white', flags: [], ...more });

describe('editor object tree', () => {
  it('places objects in branches', () => {
    expect(branchOf('item', entry('tshirt', { cat: 'clothing', covers: ['torso', 'arm_l'] }), labels)).toEqual([['clothing', '服装'], ['torso', '躯干']]);
    expect(branchOf('item', entry('boots', { cat: 'clothing', covers: ['foot_l', 'foot_r'] }), labels)[1]).toEqual(['feet', '脚部']);
    expect(branchOf('item', entry('hammer', { cat: 'tool' }), labels)).toEqual([['tools', '工具']]);
    expect(branchOf('monster', entry('mon_zombie', { species: ['ZOMBIE'] }), labels)).toEqual([['ZOMBIE', '丧尸']]);
    expect(branchOf('ter', entry('t_wall', { flags: ['WALL'], move: 0 }), labels)).toEqual([['wall', '墙']]);
    expect(branchOf('furn', entry('f_chair', { flags: ['CAN_SIT'] }), labels)[0]![0]).toBe('seat');
    expect(branchOf('vpart', entry('wheel', { cat: 'movement' }), labels)).toEqual([['movement', '移动部件']]);
    expect(branchOf('field', entry('fd_fire'), labels)[0]![0]).toBe('fire');
    expect(branchOf('trap', entry('tr_x', { hidden: true }), labels)[0]![0]).toBe('hidden');
  });

  it('builds counted, sorted branches and finds paths', () => {
    const items = [
      entry('a', { cat: 'clothing', covers: ['torso'] }),
      entry('b', { cat: 'clothing', covers: ['torso'] }),
      entry('c', { cat: 'clothing', covers: ['head'] }),
      entry('d', { cat: 'tools' }),
    ];
    const tree = buildTree([{ kind: 'item', entries: items, branch: (e) => branchOf('item', e, labels) }]);
    expect(tree[0]).toMatchObject({ path: 'item', label: '物品', count: 4 });
    expect(tree[0]!.children.map((c) => [c.path, c.count])).toEqual([['item/clothing', 3], ['item/tools', 1]]);
    expect(tree[0]!.children[0]!.children.map((c) => c.path)).toEqual(['item/clothing/torso', 'item/clothing/head']);
    expect(trail(tree, 'item/clothing/head').map((n) => n.label)).toEqual(['物品', '服装', '头部']);
    const p = pathOf('item', branchOf('item', items[0]!, labels));
    expect(p).toBe('item/clothing/torso');
    expect(inBranch(p, 'item/clothing')).toBe(true);
    expect(inBranch(p, 'item/cloth')).toBe(false);
    expect(inBranch(p, '')).toBe(true);
  });
});
