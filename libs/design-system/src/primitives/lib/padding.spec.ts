import { PADDING_CLASSES, resolvePadding, type PaddingStep } from './padding';

const PREFIXES = [
  'p',
  'px',
  'py',
  'pt',
  'pr',
  'pb',
  'pl',
  'm',
  'mx',
  'my',
  'mt',
  'mr',
  'mb',
  'ml',
] as const;
const STEPS: readonly PaddingStep[] = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32];

describe('PADDING_CLASSES', () => {
  it('has all 14 prefixes, each with all 14 steps, each mapping to the matching literal', () => {
    expect(Object.keys(PADDING_CLASSES).sort()).toEqual([...PREFIXES].sort());

    for (const prefix of PREFIXES) {
      expect(
        Object.keys(PADDING_CLASSES[prefix])
          .map(Number)
          .sort((a, b) => a - b)
      ).toEqual([...STEPS].sort((a, b) => a - b));

      for (const step of STEPS) {
        // Built by interpolation here, not in the source map: this produces
        // no class literal for Tailwind's scanner to (mis)read, so it cannot
        // itself go stale the way a hand-typed table entry can.
        expect(PADDING_CLASSES[prefix][step]).toBe(`${prefix}-${step}`);
      }
    }
  });
});

describe('resolvePadding', () => {
  it('applies a single step to all sides', () => {
    expect(resolvePadding(6, 'p')).toBe('p-6');
    expect(resolvePadding(6, 'm')).toBe('m-6');
  });

  it('applies the `0` step, which is not itself a spacing token', () => {
    expect(resolvePadding(0, 'p')).toBe('p-0');
    expect(resolvePadding(0, 'm')).toBe('m-0');
  });

  it('splits a [vertical, horizontal] pair into py/px', () => {
    expect(resolvePadding([8, 4], 'p')).toBe('py-8 px-4');
    expect(resolvePadding([8, 4], 'm')).toBe('my-8 mx-4');
  });

  it('splits a [top, right, bottom, left] quad into the four sides', () => {
    expect(resolvePadding([1, 2, 3, 4], 'p')).toBe('pt-1 pr-2 pb-3 pl-4');
    expect(resolvePadding([1, 2, 3, 4], 'm')).toBe('mt-1 mr-2 mb-3 ml-4');
  });

  it('never returns an interpolation artifact — only whole literal classes', () => {
    const results = [
      resolvePadding(0, 'p'),
      resolvePadding(32, 'm'),
      resolvePadding([10, 12], 'p'),
      resolvePadding([1, 2, 3, 4], 'm'),
    ];

    for (const result of results) {
      expect(result).not.toContain('${');
      expect(result).not.toContain('undefined');
      expect(result).toMatch(/^[pm][a-z]?-\d+( [pm][a-z]?-\d+)*$/);
    }
  });
});
