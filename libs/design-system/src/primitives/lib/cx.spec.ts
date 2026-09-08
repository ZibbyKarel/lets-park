import { cx } from './cx';

describe('cx', () => {
  it('joins the truthy values with a single space', () => {
    expect(cx('a', 'b', 'c')).toBe('a b c');
  });

  it('drops false, null, undefined and the empty string', () => {
    expect(cx('a', false, null, undefined, '', 'b')).toBe('a b');
  });

  it('returns an empty string when nothing survives', () => {
    expect(cx(false, undefined)).toBe('');
  });
});
