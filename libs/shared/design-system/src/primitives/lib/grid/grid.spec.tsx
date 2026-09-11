import { render, screen } from '@testing-library/react';

import { Grid } from './grid';

describe('Grid', () => {
  it('applies a fixed column count', () => {
    render(<Grid data-testid="grid" columns={3} />);

    const grid = screen.getByTestId('grid');
    expect(grid).toHaveClass('grid', 'grid-cols-3');
    expect(grid.className).not.toContain('md:grid-cols');
  });

  it('applies base and md column counts from the responsive form', () => {
    render(<Grid data-testid="grid" columns={{ base: 1, md: 2 }} />);

    const grid = screen.getByTestId('grid');
    expect(grid).toHaveClass('grid-cols-1', 'md:grid-cols-2');
  });

  it('omits the md class when the responsive form has no md', () => {
    render(<Grid data-testid="grid" columns={{ base: 1 }} />);

    const grid = screen.getByTestId('grid');
    expect(grid).toHaveClass('grid-cols-1');
    expect(grid.className).not.toContain('md:grid-cols');
  });

  it('resolves spacing to a gap-* class', () => {
    render(<Grid data-testid="grid" columns={2} spacing={6} />);

    expect(screen.getByTestId('grid')).toHaveClass('gap-6');
  });

  it('forwards a ref to the underlying element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<Grid ref={ref} columns={2} />);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('keeps caller classes alongside its own', () => {
    render(<Grid className="custom-class" data-testid="grid" columns={2} />);

    expect(screen.getByTestId('grid')).toHaveClass('custom-class');
  });
});
