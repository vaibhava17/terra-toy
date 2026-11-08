import { describe, expect, it } from 'vitest';
import { pickPixelRatio, pickTextureSize } from '../../src/engine/quality';

describe('pickPixelRatio', () => {
  it('passes low DPRs through unchanged', () => {
    expect(pickPixelRatio(1)).toBe(1);
    expect(pickPixelRatio(1.25, 8)).toBe(1.25);
  });

  it('caps at 2 on capable devices', () => {
    expect(pickPixelRatio(2)).toBe(2);
    expect(pickPixelRatio(3)).toBe(2);
    expect(pickPixelRatio(3, 8)).toBe(2);
    expect(pickPixelRatio(2.625, 4.5)).toBe(2);
  });

  it('caps at 1.5 when deviceMemory <= 4', () => {
    expect(pickPixelRatio(3, 4)).toBe(1.5);
    expect(pickPixelRatio(2, 2)).toBe(1.5);
    expect(pickPixelRatio(2, 0.5)).toBe(1.5);
    expect(pickPixelRatio(1, 2)).toBe(1);
  });

  it('treats an unknown deviceMemory as capable', () => {
    expect(pickPixelRatio(3, undefined)).toBe(2);
    expect(pickPixelRatio(3, Number.NaN)).toBe(2);
  });

  it('falls back to 1 for nonsense DPR values', () => {
    expect(pickPixelRatio(0)).toBe(1);
    expect(pickPixelRatio(-2)).toBe(1);
    expect(pickPixelRatio(Number.NaN)).toBe(1);
  });
});

describe('pickTextureSize', () => {
  it('uses 4096×2048 on high-DPI devices with memory and GPU to spare', () => {
    expect(pickTextureSize(2, 8, 16384)).toEqual({ width: 4096, height: 2048 });
    expect(pickTextureSize(1.5, undefined, 4096)).toEqual({ width: 4096, height: 2048 });
  });

  it('uses 2048×1024 on low memory', () => {
    expect(pickTextureSize(3, 4, 16384)).toEqual({ width: 2048, height: 1024 });
    expect(pickTextureSize(2, 1, 16384)).toEqual({ width: 2048, height: 1024 });
  });

  it('uses 2048×1024 when DPR < 1.5', () => {
    expect(pickTextureSize(1, 16, 16384)).toEqual({ width: 2048, height: 1024 });
    expect(pickTextureSize(1.49, 16, 16384)).toEqual({ width: 2048, height: 1024 });
  });

  it('uses 2048×1024 when the GPU cannot hold a 4096 texture', () => {
    expect(pickTextureSize(2, 8, 4095)).toEqual({ width: 2048, height: 1024 });
    expect(pickTextureSize(2, 8, 2048)).toEqual({ width: 2048, height: 1024 });
  });

  it('is always 2:1', () => {
    for (const dpr of [0.5, 1, 1.5, 2, 3]) {
      for (const mem of [undefined, 0.5, 4, 8]) {
        for (const max of [2048, 4096, 8192]) {
          const s = pickTextureSize(dpr, mem, max);
          expect(s.width).toBe(2 * s.height);
          expect([2048, 4096]).toContain(s.width);
        }
      }
    }
  });
});
