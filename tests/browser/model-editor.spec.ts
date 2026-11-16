// Model studio (index.html): find objects, see them at their in-game size next to the
// wall and person references, preview an edit. Nothing is saved (the overrides file is
// left alone). Screenshots: build/editor-*.png.
import { type Page } from '@playwright/test';

import { expect, test } from '../support/browser-fixture';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const E = (page: Page) => <T>(fn: (e: any) => T) => page.evaluate(`(${fn.toString()})(window.__editor)`) as Promise<T>;

const KIND_NAMES: Record<string, string> = { furn: '家具', ter: '地形', item: '物品', monster: '生物', vehicle: '载具', vpart: '载具部件', field: '场地效果', trap: '陷阱' };

async function open(page: Page, query: string) {
  await page.goto(`/${query}${query.includes('?') ? '&' : '?'}lang=zh_CN`);
  const e = E(page);
  await expect.poll(() => e((x) => Boolean(x?.ready && x.measure)), { timeout: 90_000 }).toBe(true);
  return e;
}

test('model editor: search, real size, references and live edit', async ({ page, browserLog }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1500, height: 900 });
  const e = await open(page, '?kind=furn&id=f_chair');

  // The catalog comes from the CDDA data with every kind filled.
  const sizes = await e((x) => x.catalogSizes);
  for (const kind of ['ter', 'furn', 'item', 'monster', 'vehicle']) expect(sizes[kind]).toBeGreaterThan(100);

  // A chair stands on the ground, lower than the wall and the person.
  const world = await e((x) => x.world);
  const chair = await e((x) => x.measure);
  expect(chair.height).toBeGreaterThan(0.2 * world.personHeight);
  expect(chair.height).toBeLessThan(world.wallHeight);
  expect(chair.bottom).toBeGreaterThan(-0.02);
  await expect(page.locator('#ed-measure')).toContainText('格');
  await expect(page.locator('#ed-inspector')).toContainText('f_chair');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'build/editor-chair.png' });

  // Search by Chinese name narrows the list; clicking a row selects it.
  await page.fill('#ed-search', '冰箱');
  await expect(page.locator('#ed-list li[data-id]').first()).toBeVisible();
  const first = await page.locator('#ed-list li[data-id]').first().getAttribute('data-id');
  await page.locator('#ed-list li[data-id]').first().click();
  await expect.poll(() => e((x) => x.selected?.id)).toBe(first);

  // Live edit: doubling the scale doubles the measured height (preview only, not saved).
  await e((x) => x.select('furn', 'f_chair'));
  await expect.poll(() => e((x) => x.ready && x.selected?.id === 'f_chair' && x.measure?.height)).toBeTruthy();
  const before = (await e((x) => x.measure)).height;
  const model = await page.inputValue('#f-model');
  if (model) {
    await page.fill('#f-scale', '2');
    await expect.poll(() => e((x) => x.measure.height), { timeout: 10_000 }).toBeGreaterThan(before * 1.9);
    expect((await e((x) => x.measure)).height).toBeLessThan(before * 2.1);
    await expect(page.locator('#ed-saved')).toContainText('未保存');
    await page.click('#f-revert');
    await expect.poll(() => e((x) => x.measure.height)).toBeCloseTo(before, 2);
  }

  // A zombie is drawn at about a person's height.
  await e((x) => x.select('monster', 'mon_zombie'));
  await expect.poll(() => e((x) => x.ready && x.selected?.id === 'mon_zombie' && x.subject?.source)).toBeTruthy();
  await page.waitForTimeout(800);
  const zombie = await e((x) => x.measure);
  expect(zombie.height).toBeGreaterThan(world.personHeight * 0.75);
  expect(zombie.height).toBeLessThan(world.personHeight * 1.3);
  await page.screenshot({ path: 'build/editor-zombie.png' });

  // A wall terrain shows on the wall-height run.
  await e((x) => x.select('ter', 't_wall'));
  await expect.poll(() => e((x) => x.ready && x.selected?.id === 't_wall' && x.measure?.height)).toBeTruthy();
  expect((await e((x) => x.measure)).height).toBeCloseTo(world.wallHeight, 1);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'build/editor-wall.png' });

  // The branch picker: a dropdown tree over every kind; each kind and a nested branch list objects.
  await page.fill('#ed-search', '');
  for (const kind of ['furn', 'ter', 'item', 'monster', 'vehicle', 'vpart', 'field', 'trap']) {
    await page.click('#ed-branch');
    await expect(page.locator('#ed-tree')).toBeVisible();
    await page.click(`#ed-tree [data-path="${kind}"]`);
    await expect(page.locator('#ed-tree')).toBeHidden();
    await expect(page.locator('#ed-branch')).toContainText(KIND_NAMES[kind]);
    await expect(page.locator('#ed-list li[data-id]').first()).toBeVisible();
  }
  // Items › clothing › torso, opened by expanding the branches.
  await page.click('#ed-branch');
  for (const path of ['item', 'item/clothing']) {
    const caret = page.locator(`#ed-tree [data-expand="${path}"]`);
    if ((await caret.getAttribute('aria-label')) === '展开') await caret.click();
    await expect(page.locator(`#ed-tree [data-expand="${path}"]`)).toHaveAttribute('aria-label', '折叠');
  }
  await page.screenshot({ path: 'build/editor-tree.png' });
  await page.click('#ed-tree [data-path="item/clothing/torso"]');
  await expect(page.locator('#ed-branch')).toContainText('躯干');
  await page.locator('#ed-list li[data-id]').first().click();
  await expect.poll(() => e((x) => x.ready && x.selected?.kind === 'item' && x.subject?.source)).toBeTruthy();
  // View-only kinds explain how the game draws them.
  await e((x) => x.select('vpart', 'wheel'));
  await expect.poll(() => e((x) => x.ready && x.selected?.id === 'wheel' && x.subject?.source)).toContain('车轮');
  await expect(page.locator('#ed-inspector')).toContainText('只能查看');
  // Everything at once: search across kinds.
  await e((x) => x.setBranch(''));
  await page.fill('#ed-search', 'f_chair');
  await expect(page.locator('#ed-list li[data-kind="furn"][data-id="f_chair"]')).toBeVisible();

  // The model library lists models and who uses them.
  await page.fill('#ed-search', '');
  await page.click('#ed-branch');
  await page.click('#ed-tree [data-path="model"]');
  await expect(page.locator('#ed-list li[data-id]').first()).toBeVisible();
  await page.locator('#ed-list li[data-id]').first().click();
  await expect(page.locator('#ed-inspector')).toContainText('使用这个模型的对象');
  await page.screenshot({ path: 'build/editor-model.png' });

  // The server refuses a bad override document.
  const bad = await page.evaluate(async () => (await fetch('/api/editor/overrides', { method: 'PUT', body: JSON.stringify({ rules: [{ kind: 'x' }] }) })).status);
  expect(bad).toBe(400);

  // (The refused PUT above shows up as a failed request.)
  expect(browserLog.errors.filter((l) => !/400|api\/editor\/overrides/.test(l))).toEqual([]);
});

test('model editor: thumbnail grid', async ({ page, browserLog }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1500, height: 900 });
  const e = await open(page, '?kind=furn&id=f_chair&branch=furn');

  // Switch to the grid: visible cells get rendered pictures, the rest wait.
  await page.click('#ed-layout [data-layout="grid"]');
  await expect(page.locator('#ed-list')).toHaveClass(/grid/);
  await expect.poll(() => page.locator('#ed-list .th img').count(), { timeout: 60_000 }).toBeGreaterThan(6);
  const cells = await page.locator('#ed-list li[data-id]').count();
  expect(await page.locator('#ed-list .th img').count()).toBeLessThan(cells);
  // A rendered picture is not blank.
  const filled = await page.locator('#ed-list .th img').first().evaluate(async (img: HTMLImageElement) => {
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n / (c.width * c.height);
  });
  expect(filled).toBeGreaterThan(0.02);
  await page.screenshot({ path: 'build/editor-grid.png' });

  // Cell size, arrow keys, and clicking a cell selects it.
  await page.click('#ed-layout [data-cell="l"]');
  await expect(page.locator('#ed-list')).toHaveClass(/cell-l/);
  await page.locator('#ed-list li[data-id]').nth(1).click();
  const picked = await e((x) => x.selected?.id);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => e((x) => x.selected?.id)).not.toBe(picked);

  // Other kinds render too (a creature and a terrain tile).
  await page.click('#ed-branch');
  await page.click('#ed-tree [data-path="ter"]');
  await expect.poll(() => page.locator('#ed-list .th img').count(), { timeout: 60_000 }).toBeGreaterThan(3);
  await page.click('#ed-branch');
  await page.click('#ed-tree [data-path="monster"]');
  await expect.poll(() => page.locator('#ed-list .th img').count(), { timeout: 90_000 }).toBeGreaterThan(2);
  await page.screenshot({ path: 'build/editor-grid-monster.png' });

  // The layout is remembered.
  await page.reload();
  await expect.poll(() => e((x) => x?.layout), { timeout: 90_000 }).toEqual({ layout: 'grid', cellSize: 'l' });

  expect(browserLog.errors).toEqual([]);
});
