import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DICT, t } from '../../src/editor/i18n';

const sources = [...['src/editor', 'src/render'].flatMap((d) => readdirSync(d).filter((f) => f.endsWith('.ts')).map((f) => `${d}/${f}`)), 'index.html'];
const code = (f: string) => readFileSync(f, 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*\*)/.test(l)).join('\n');

describe('interface translations', () => {
  it('has English and Russian for every string the interface shows', () => {
    const keys = new Set<string>();
    for (const f of sources) {
      const s = code(f);
      for (const m of s.matchAll(/\bt\('([^']*)'/g)) if (/[一-龥]/.test(m[1])) keys.add(m[1]);
      for (const m of s.matchAll(/data-i18n(?:-title|-placeholder)?="([^"]*)"/g)) keys.add(m[1]);
    }
    expect(keys.size).toBeGreaterThan(150);
    const missing = [...keys].filter((k) => !DICT[k]?.[0] || !DICT[k]?.[1]);
    expect(missing).toEqual([]);
    // Placeholders survive translation.
    for (const k of keys) for (const p of k.match(/\{\w+\}/g) ?? []) for (const tr of DICT[k]) expect(tr, `${k} → ${tr}`).toContain(p);
  });

  it('leaves no Chinese outside t() in the interface code', () => {
    const stray: string[] = [];
    for (const f of sources.filter((f) => f.endsWith('.ts') && !f.endsWith('i18n.ts'))) {
      code(f).split('\n').forEach((line, i) => {
        if (/[一-龥]/.test(line.replace(/\bt\('[^']*'/g, ''))) stray.push(`${f}:${i + 1}`);
      });
    }
    expect(stray).toEqual([]);
  });

  it('fills placeholders (the source language outside a browser)', () => {
    expect(t('{n} 项 · 匹配 {m} 项', { n: 3, m: 1 })).toBe('3 项 · 匹配 1 项');
  });
});
