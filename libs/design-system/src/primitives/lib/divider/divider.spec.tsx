import { render, screen } from '@testing-library/react';

import { Divider } from './divider';

describe('Divider', () => {
  it('renders a real <hr> by default, with the border tone and no orientation ARIA', () => {
    render(<Divider data-testid="divider" />);

    const divider = screen.getByTestId('divider');
    expect(divider.tagName).toBe('HR');
    expect(divider).toHaveClass('border-t', 'border-border');
    expect(divider).not.toHaveAttribute('role');
    expect(divider).not.toHaveAttribute('aria-orientation');
  });

  it('exposes the horizontal hr through the separator role, as the browser maps it', () => {
    render(<Divider />);

    expect(screen.getByRole('separator')).toBeInTheDocument();
  });

  it('switches to the divider tone', () => {
    render(<Divider data-testid="divider" tone="divider" />);

    expect(screen.getByTestId('divider')).toHaveClass('border-divider');
  });

  it('renders a role="separator" div with aria-orientation for vertical', () => {
    render(<Divider data-testid="divider" orientation="vertical" />);

    const divider = screen.getByTestId('divider');
    expect(divider.tagName).toBe('DIV');
    expect(divider).toHaveAttribute('role', 'separator');
    expect(divider).toHaveAttribute('aria-orientation', 'vertical');
    expect(divider).toHaveClass('border-l');
  });

  it('applies spacing as my-* on a horizontal divider', () => {
    render(<Divider data-testid="divider" spacing={4} />);

    const divider = screen.getByTestId('divider');
    expect(divider).toHaveClass('my-4');
    expect(divider.className).not.toContain('mx-4');
  });

  it('applies spacing as mx-* on a vertical divider', () => {
    render(<Divider data-testid="divider" orientation="vertical" spacing={4} />);

    const divider = screen.getByTestId('divider');
    expect(divider).toHaveClass('mx-4');
    expect(divider.className).not.toContain('my-4');
  });

  it('keeps caller classes alongside its own', () => {
    render(<Divider data-testid="divider" className="custom-class" />);

    expect(screen.getByTestId('divider')).toHaveClass('custom-class');
  });

  it('forwards a ref to the underlying element', () => {
    const ref = { current: null as HTMLElement | null };
    render(<Divider ref={ref} />);

    expect(ref.current?.tagName).toBe('HR');
  });
});
