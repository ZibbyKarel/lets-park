import { render, screen } from '@testing-library/react';

import { Spacer } from './spacer';

describe('Spacer', () => {
  it('grows to fill the available space when no size is given', () => {
    render(<Spacer data-testid="spacer" />);

    expect(screen.getByTestId('spacer')).toHaveClass('flex-1');
  });

  it('renders a fixed width and height for a given size, and does not shrink', () => {
    render(<Spacer data-testid="spacer" size={6} />);

    const spacer = screen.getByTestId('spacer');
    expect(spacer).toHaveClass('w-6', 'h-6', 'shrink-0');
    expect(spacer.className).not.toContain('flex-1');
  });

  it('is hidden from assistive technology', () => {
    render(<Spacer data-testid="spacer" />);

    expect(screen.getByTestId('spacer')).toHaveAttribute('aria-hidden', 'true');
  });

  it('keeps caller classes alongside its own', () => {
    render(<Spacer data-testid="spacer" className="custom-class" />);

    expect(screen.getByTestId('spacer')).toHaveClass('custom-class');
  });

  it('forwards a ref to the underlying element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<Spacer ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });
});
