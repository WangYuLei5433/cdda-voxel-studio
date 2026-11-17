// Voxel sets under vendor/voxel/ (node tools/fetch-voxel-starter.mjs) show up as the
// "voxel models" kind: each model stands on its tile at cataclysm-3d's scale.
// Screenshots: build/vox-*.png.
import { existsSync } from 'node:fs';

import { expect, test } from '../support/browser-fixture';

const ready = 'Boolean(window.__editor?.ready && window.__editor.measure)';

test.skip(!existsSync('vendor/voxel/starter/voxelset.json'), 'no voxel set in vendor/voxel');

for (const name of ['humanoid', 'zombie', 'tree', 'sofa', 'wall_brick', 'vehicle', 'quadruped', 'item_gun']) {
  test(`voxel model ${name}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1500, height: 900 });
    await page.goto(`/?kind=vox&id=${encodeURIComponent(`starter:builtin/${name}.vox`)}&lang=zh_CN`);
    await expect.poll(() => page.evaluate(ready), { timeout: 60_000 }).toBe(true);
    const m = await page.evaluate('window.__editor.measure') as { height: number; bottom: number };
    expect(m.height).toBeGreaterThan(0);
    expect(m.bottom).toBeGreaterThan(-0.02);
    await expect(page.locator('#ed-inspector')).toContainText('体素');
    await page.waitForTimeout(600);
    await page.screenshot({ path: `build/vox-${name}.png` });
  });
}

test('voxel library grid', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('vox-editor-layout', 'grid'); localStorage.setItem('vox-editor-cell', 'm'); });
  await page.goto(`/?kind=vox&id=${encodeURIComponent('starter:builtin/humanoid.vox')}&branch=vox&lang=zh_CN`);
  await expect.poll(() => page.evaluate(ready), { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'build/vox-grid.png' });
});

// CDDA creatures get the set's model for their built-in type (tools/classify/builtin-kinds.mjs).
for (const [id, file] of [['mon_triffid', 'plant_creature'], ['mon_zombie', 'zombie'], ['mon_civilian_police', 'humanoid'], ['mon_dog', 'quadruped'], ['mon_chicken', 'bird']]) {
  test(`creature ${id} shows ${file}.vox`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1500, height: 900 });
    await page.goto(`/?kind=monster&id=${id}&lang=zh_CN`);
    await expect.poll(() => page.evaluate(ready), { timeout: 60_000 }).toBe(true);
    // A mesh set that binds this exact id wins over the voxel set's built-in type.
    test.skip(await page.evaluate('window.__editor.status') === 'mesh', `a mesh set in vendor/mesh binds ${id} exactly`);
    await expect(page.locator('#ed-inspector')).toContainText(`starter/builtin/${file}.vox`);
    await expect(page.locator('#ed-inspector')).toContainText(`按原型匹配：${file}`);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `build/vox-creature-${id}.png` });
  });
}

test('plants branch as a thumbnail grid', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.addInitScript(() => { localStorage.setItem('vox-editor-layout', 'grid'); localStorage.setItem('vox-editor-cell', 'm'); });
  await page.goto('/?kind=monster&id=mon_triffid&branch=monster/PLANT&lang=zh_CN');
  await expect.poll(() => page.evaluate(ready), { timeout: 60_000 }).toBe(true);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'build/vox-plants-grid.png' });
});
