import { GAP_CLASSES, resolveGap } from './gap';
import type { SpacingKey } from '@lets-park/design-system/tokens';

const STEPS: readonly SpacingKey[] = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32];

describe('GAP_CLASSES', () => {
  it('has all 13 spacing steps, each mapping to the matching literal', () => {
    expect(
      Object.keys(GAP_CLASSES)
        .map(Number)
        .sort((a, b) => a - b)
    ).toEqual([...STEPS].sort((a, b) => a - b));

    for (const step of STEPS) {
      // Built by interpolation here, not in the source map: this produces no
      // class literal for Tailwind's scanner to (mis)read, so it cannot
      // itself go stale the way a hand-typed table entry can.
      expect(GAP_CLASSES[step]).toBe(`gap-${step}`);
    }
  });
});

describe('resolveGap', () => {
  it('resolves each step to its gap-* class', () => {
    for (const step of STEPS) {
      expect(resolveGap(step)).toBe(`gap-${step}`);
    }
  });
});
