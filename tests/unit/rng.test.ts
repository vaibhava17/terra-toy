import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../src/game/rng';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('differs between seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('yields values in [0, 1) with a sane mean', () => {
    const r = mulberry32(7);
    let sum = 0;
    const n = 10_000;
    for (let i = 0; i < n; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / n).toBeCloseTo(0.5, 1);
  });
});
