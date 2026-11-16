import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { copyMaterial } from '../../src/render/textures';

describe('copyMaterial', () => {
  it('keeps the shader hooks a plain clone drops', () => {
    const m = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const hook = () => {};
    m.onBeforeCompile = hook;
    m.customProgramCacheKey = () => 'tri-1-face';
    expect(Object.prototype.hasOwnProperty.call(m.clone(), 'onBeforeCompile')).toBe(false);
    const c = copyMaterial(m);
    expect(c).not.toBe(m);
    expect(c.onBeforeCompile).toBe(hook);
    expect(c.customProgramCacheKey()).toBe('tri-1-face');
    expect(c.color.getHex()).toBe(0xff0000);
  });
});
