// Objects without a voxel model show a stand-in box sized from their CDDA data.
// Screenshots: build/box-*.png.
import { expect, test } from '../support/browser-fixture';

const ready = 'Boolean(window.__editor?.ready && window.__editor.measure)';

const cases: [string, string, (m: { width: number; depth: number; height: number; bottom: number }) => void][] = [
  ['item', 'fire_ax', (m) => expect(Math.max(m.width, m.depth)).toBeGreaterThan(0.5)],
  ['furn', 'f_chair', (m) => expect(m.height).toBeCloseTo(0.9, 2)],
  ['ter', 't_wall', (m) => expect(m.height).toBeCloseTo(2, 2)],
  ['vehicle', 'car', (m) => expect(m.depth).toBeGreaterThan(3)],
];

for (const [kind, id, check] of cases) {
  test(`stand-in box for ${id}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1500, height: 900 });
    await page.goto(`/?kind=${kind}&id=${id}&lang=zh_CN`);
    await expect.poll(() => page.evaluate(ready), { timeout: 60_000 }).toBe(true);
    const m = await page.evaluate('window.__editor.measure') as { width: number; depth: number; height: number; bottom: number };
    expect(m.bottom).toBeGreaterThan(-0.01);
    check(m);
    // With a voxel set loaded these objects have no voxel model yet (no built-in types for them).
    if (await page.evaluate('window.__editor.status') === 'none') await expect(page.locator('#ed-inspector')).toContainText('占位长方体');
    await page.screenshot({ path: `build/box-${id}.png` });
  });
}
