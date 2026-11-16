// Fallback colours for fields (fire, smoke, blood…) that have no texture.
const FIELD_COLORS: [RegExp, number][] = [
  [/fire|fd_flame/, 0xff6a1a],
  [/smoke|fog|mist/, 0x8a8a8a],
  [/blood|gibs/, 0x8a1010],
  [/acid|bile/, 0x8ad020],
  [/electric|shock/, 0x80c0ff],
  [/web/, 0xdddddd],
];

export function fieldColor(id: string): number {
  for (const [re, c] of FIELD_COLORS) if (re.test(id)) return c;
  return 0x6080a0;
}
