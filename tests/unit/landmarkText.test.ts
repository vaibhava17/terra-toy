import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '../../src/content/landmarks';
import { landmarkEmoji } from '../../src/ui/landmarkText';

describe('landmarkEmoji', () => {
  const icon = (id: string) => landmarkEmoji(LANDMARKS.find((l) => l.id === id)!);

  it('never shows one landmark the icon of another', () => {
    expect(icon('statue-of-liberty')).toBe('🗽');
    expect(icon('christ-the-redeemer')).not.toBe('🗽');
    expect(icon('big-ben')).toBe('🕰️');
    for (const lm of LANDMARKS) {
      if (lm.id !== 'statue-of-liberty') expect(landmarkEmoji(lm), lm.id).not.toBe('🗽');
    }
  });

  it('falls back to the category emoji', () => {
    expect(icon('mount-fuji')).toBe('🏔️');
    expect(landmarkEmoji({ id: 'not-a-landmark', category: 'tower' })).toBe('🗼');
  });
});
