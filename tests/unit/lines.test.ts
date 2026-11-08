import { describe, expect, it } from 'vitest';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { CountryLines, LINE_PALETTE, injectHorizonFade } from '../../src/engine/globe/Lines';

describe('injectHorizonFade', () => {
  it("still finds its anchors in three's LineMaterial shaders", () => {
    const m = new LineMaterial();
    const shader = { vertexShader: m.vertexShader, fragmentShader: m.fragmentShader };
    expect(injectHorizonFade(shader)).toBe(true);
    expect(shader.vertexShader).toContain('vFacing = dot(');
    expect(shader.fragmentShader).toContain('alpha *= smoothstep( 0.0, 0.06, vFacing );');
    // Declared exactly once in each stage, before main().
    for (const src of [shader.vertexShader, shader.fragmentShader]) {
      expect(src.match(/varying float vFacing;/g)).toHaveLength(1);
      expect(src.indexOf('varying float vFacing;')).toBeLessThan(src.indexOf('void main() {'));
    }
    m.dispose();
  });

  it('leaves unknown shaders untouched', () => {
    const shader = { vertexShader: 'void main() {}', fragmentShader: 'void main() {}' };
    expect(injectHorizonFade(shader)).toBe(false);
    expect(shader).toEqual({ vertexShader: 'void main() {}', fragmentShader: 'void main() {}' });
  });
});

describe('CountryLines', () => {
  it('uses palette colours and swaps border levels only once they are added', () => {
    expect(Object.values(LINE_PALETTE).every((c) => /^#[0-9a-f]{6}$/.test(c))).toBe(true);
    const lines = new CountryLines();
    expect(lines.level).toBeNull();
    expect(lines.showBorders('110m')).toBe(false);
    lines.addBorders('110m', [
      [
        [0, 0],
        [5, 5],
      ],
    ]);
    expect(lines.hasBorders('110m')).toBe(true);
    expect(lines.showBorders('110m')).toBe(true);
    expect(lines.showBorders('110m')).toBe(false);
    expect(lines.level).toBe('110m');
    expect(lines.setBorderWidth(1.5)).toBe(true);
    expect(lines.setBorderWidth(1.505)).toBe(false);
    expect(lines.showHover(null)).toBe(false);
    lines.dispose();
  });
});
