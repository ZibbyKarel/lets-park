import { render, screen } from '@testing-library/react';

import { Box } from './box';

describe('Box', () => {
  it('applies no classes by default beyond a caller className', () => {
    render(
      <Box className="custom-class" data-testid="box">
        content
      </Box>
    );

    expect(screen.getByTestId('box')).toHaveClass('custom-class');
  });

  it('resolves padding and margin independently', () => {
    render(<Box data-testid="box" padding={6} margin={[2, 4]} />);

    const box = screen.getByTestId('box');
    expect(box).toHaveClass('p-6', 'my-2', 'mx-4');
  });

  it.each([
    ['bg', 'bg-bg'],
    ['bg-soft', 'bg-bg-soft'],
    ['bg-muted', 'bg-bg-muted'],
  ] as const)('maps background=%s to %s', (background, expected) => {
    render(<Box data-testid="box" background={background} />);

    expect(screen.getByTestId('box')).toHaveClass(expected);
  });

  it.each([
    ['sm', 'rounded-sm'],
    ['md', 'rounded-md'],
    ['lg', 'rounded-lg'],
  ] as const)('maps radius=%s to %s', (radius, expected) => {
    render(<Box data-testid="box" radius={radius} />);

    expect(screen.getByTestId('box')).toHaveClass(expected);
  });

  it('adds a border when border is set', () => {
    render(<Box data-testid="box" border />);

    expect(screen.getByTestId('box')).toHaveClass('border', 'border-border');
  });

  it('forwards a ref to the underlying element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<Box ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
