// Mesh sets under vendor/mesh/ (meshset.json + .glb / .gltf / .obj) show up in the model
// library, and CDDA objects they bind get the mesh model. The set is written by the test
// (tests/support/mesh-fixture.ts). Screenshots: build/mesh-*.png.
import { expect, test } from '../support/browser-fixture';
import { MESH_FIXTURE, writeMeshFixture } from '../support/mesh-fixture';

const ready = 'Boolean(window.__editor?.ready && window.__editor.measure)';
type Measure = { width: number; depth: number; height: number; bottom: number };
type SubjectInfo = { source: string; notes: string[]; clips: [string, string][]; playing: string | null };

let remove: () => void;
test.beforeAll(() => { remove = writeMeshFixture(); });
test.afterAll(() => remove());

test('glb in the library: textured, placed, animated', async ({ page, browserLog }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto(`/?kind=vox&id=${encodeURIComponent(`mesh:${MESH_FIXTURE}:box.glb`)}&lang=zh_CN`);
  await expect.poll(() => page.evaluate(ready), { timeout: 60_000 }).toBe(true);
  const m = await page.evaluate('window.__editor.measure') as Measure;
  // fit 0.8: the 1-wide box scales by 0.8.
  expect(m.width).toBeCloseTo(0.8, 2);
  expect(m.height).toBeCloseTo(1.6, 2);
  expect(m.bottom).toBeCloseTo(0, 2);
  const s = await page.evaluate('window.__editor.subject') as SubjectInfo;
  expect(s.source).toBe(`${MESH_FIXTURE}/box.glb`);
  expect(s.notes.join('\n')).toContain('12 个三角形 · 1 张贴图');
  expect(s.notes.join('\n')).toContain('文件里没有这些动画：Walk');
  expect(s.clips).toEqual([['idle · Idle', 'Idle']]);
  expect(s.playing).toBe('Idle');
  await expect(page.locator('#ed-anims')).toBeVisible();
  await page.locator('#ed-anims button[data-clip=""]').click();
  expect(await page.evaluate('window.__editor.subject.playing')).toBeNull();
  await page.screenshot({ path: 'build/mesh-glb.png' });
  expect(browserLog.errors).toEqual([]);
});

test('a CDDA object bound in meshset.json shows its mesh', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/?kind=furn&id=f_crate_c&lang=zh_CN');
  await expect.poll(() => page.evaluate(ready), { timeout: 60_000 }).toBe(true);
  // A voxel set may give the crate a model first; the mesh set only fills in.
  const status = await page.evaluate('window.__editor.status');
  test.skip(status === 'voxel', 'a voxel set in vendor/voxel already models f_crate_c');
  expect(status).toBe('mesh');
  await expect(page.locator('#ed-inspector')).toContainText('网格素材集 Test meshes：按 id 匹配');
  await expect(page.locator('#ed-inspector')).toContainText('meshset.json');
  await page.screenshot({ path: 'build/mesh-object.png' });
});

test('obj with its mtl', async ({ page, browserLog }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto(`/?kind=vox&id=${encodeURIComponent(`mesh:${MESH_FIXTURE}:crate.obj`)}&lang=zh_CN`);
  await expect.poll(() => page.evaluate(ready), { timeout: 60_000 }).toBe(true);
  const m = await page.evaluate('window.__editor.measure') as Measure;
  expect(m.height).toBeCloseTo(0.5, 2);
  expect(m.width).toBeCloseTo(0.5, 2);
  expect((await page.evaluate('window.__editor.subject') as SubjectInfo).notes.join('\n')).toContain('12 个三角形');
  await expect(page.locator('#ed-anims')).toBeHidden();
  await page.screenshot({ path: 'build/mesh-obj.png' });
  expect(browserLog.errors).toEqual([]);
});

test('the library tree lists the mesh set', async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto('/?branch=vox&lang=zh_CN');
  await expect.poll(() => page.evaluate('window.__editor?.frames > 5'), { timeout: 60_000 }).toBe(true);
  const labels = await page.evaluate(() => {
    const tree = (window as unknown as { __editor: { tree(): { path: string; children: { label: string }[] }[] } }).__editor.tree();
    return tree.find((n) => n.path === 'vox')?.children.map((c) => c.label) ?? [];
  });
  expect(labels).toContain('网格集：Test meshes');
});

test('switch an object between its sources', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/?kind=furn&id=f_crate_c&lang=zh_CN');
  await expect.poll(() => page.evaluate(ready), { timeout: 60_000 }).toBe(true);
  const sources = await page.evaluate('window.__editor.sources') as { list: { key: string; label: string }[]; active: string };
  // Every set with a model for it, then the stand-in box; the default comes first.
  expect(sources.list.map((s) => s.key)).toContain(`mesh:${MESH_FIXTURE}`);
  expect(sources.list.at(-1)?.key).toBe('box');
  expect(sources.active).toBe(sources.list[0].key);
  await expect(page.locator('#ed-pick .ed-pick-buttons')).toBeVisible();

  await page.locator('#ed-pick button[data-source="box"]').click();
  await expect.poll(() => page.evaluate(ready)).toBe(true);
  await expect.poll(() => page.evaluate('window.__editor.sources.active')).toBe('box');
  expect(page.url()).toContain('src=box');
  await expect(page.locator('#ed-inspector')).toContainText('占位长方体');
  await expect(page.locator('#ed-inspector')).toContainText('预览来源');

  // The choice survives a reload (?src=), and choosing the default clears it.
  await page.reload();
  await expect.poll(() => page.evaluate(ready), { timeout: 60_000 }).toBe(true);
  expect(await page.evaluate('window.__editor.sources.active')).toBe('box');
  await page.evaluate(`window.__editor.setSource(${JSON.stringify(sources.list[0].key)})`);
  await expect.poll(() => page.evaluate('window.__editor.sources.active')).toBe(sources.list[0].key);
  expect(page.url()).not.toContain('src=');
  await page.screenshot({ path: 'build/mesh-sources.png' });
});

test('try a library model on an object', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1500, height: 900 });
  await page.goto('/?kind=item&id=glock_19&lang=zh_CN');
  await expect.poll(() => page.evaluate(ready), { timeout: 60_000 }).toBe(true);
  // The picker lists the library's files.
  // In the inspector, under the model section.
  await page.locator('#ed-try summary').click();
  await expect(page.locator('#ed-try-list')).toBeVisible();
  await page.locator('#ed-try-q').fill('box.glb');
  const key = `mesh:${MESH_FIXTURE}:box.glb`;
  await page.locator(`#ed-try-list li[data-try="${key}"]`).click();
  await expect.poll(() => page.evaluate('window.__editor.tryOn')).toBe(key);
  await expect.poll(() => page.evaluate(ready)).toBe(true);
  expect(page.url()).toContain('try=');
  // Sized as the item: its longest side (211 mm) along the ground.
  const m = await page.evaluate('window.__editor.measure') as Measure;
  expect(Math.max(m.width, m.depth)).toBeCloseTo(0.211, 2);
  await expect(page.locator('#ed-inspector')).toContainText('只是预览，未绑定');
  const line = JSON.parse(await page.evaluate('window.__editor.trySnippet()') as string);
  expect(line).toEqual({ id: 'glock_19', pool: `${MESH_FIXTURE}:box.glb`, file: 'items/glock_19.glb', fit: 0.211, why: '' });
  await page.screenshot({ path: 'build/mesh-try.png' });
  // Stopping goes back to the object's own model.
  await page.locator('#ed-pick button[data-try-clear]').click();
  await expect.poll(() => page.evaluate('window.__editor.tryOn')).toBeNull();
  expect(page.url()).not.toContain('try=');
});

test('try a library file on an object, from the model library', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1500, height: 900 });
  const key = `mesh:${MESH_FIXTURE}:box.glb`;
  await page.goto(`/?kind=vox&id=${encodeURIComponent(key)}&lang=zh_CN`);
  await expect.poll(() => page.evaluate(ready), { timeout: 60_000 }).toBe(true);
  await page.locator('#ed-try summary').click();
  await page.locator('#ed-target-q').fill('glock_19');
  await page.locator('#ed-target-list button[data-target-id="glock_19"]').click();
  await expect.poll(() => page.evaluate('window.__editor.selected?.id')).toBe('glock_19');
  await expect.poll(() => page.evaluate('window.__editor.tryOn')).toBe(key);
  await expect.poll(() => page.evaluate(ready)).toBe(true);
  await expect(page.locator('#ed-pick .ed-try-on')).toContainText('试配中');
});
