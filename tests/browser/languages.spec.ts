// Interface languages: Russian and English pages show translated interface text and CDDA
// object names (official translations; English where Russian has none). Screenshots:
// build/studio-ru.png, build/studio-en.png.
import { expect, test } from '../support/browser-fixture';

const cases = [
  { lang: 'ru', title: 'Студия моделей CDDA', name: 'стул', heading: 'Нет модели', kind: 'Мебель' },
  { lang: 'en', title: 'CDDA Model Studio', name: 'chair', heading: 'No model', kind: 'Furniture' },
];

for (const c of cases) {
  test(`studio in ${c.lang}`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1500, height: 900 });
    await page.goto(`/?kind=furn&id=f_chair&lang=${c.lang}`);
    await expect.poll(() => page.evaluate('Boolean(window.__editor?.ready && window.__editor.measure)'), { timeout: 90_000 }).toBe(true);
    await expect(page.locator('.ed-title')).toHaveText(c.title);
    await expect(page.locator('#ed-inspector .ed-name').first()).toContainText(c.name);
    await expect(page.locator('#ed-inspector')).toContainText(c.heading);
    await expect(page.locator('#ed-branch')).toContainText(c.kind);
    await expect(page.locator('#ed-lang')).toHaveValue(c.lang);
    // No Chinese left (the language picker names Chinese in Chinese).
    const text = (await page.locator('body').innerText()).replace('中文', '');
    expect(text.match(/.{0,30}[一-龥]+.{0,30}/g)).toBeNull();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `build/studio-${c.lang}.png` });
  });
}
