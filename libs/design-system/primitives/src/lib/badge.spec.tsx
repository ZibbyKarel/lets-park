import { render, screen } from '@testing-library/react';

import { Badge } from './badge';

describe('Badge', () => {
  it('renders its content as plain text', () => {
    render(<Badge>Otevřeno</Badge>);

    expect(screen.getByText('Otevřeno')).toBeInTheDocument();
  });

  it('adds no role of its own — it is a label, not a control', () => {
    const { container } = render(<Badge>Otevřeno</Badge>);

    const badge = container.firstElementChild;
    expect(badge?.tagName).toBe('SPAN');
    expect(badge).not.toHaveAttribute('role');
  });

  it('renders one colour pair per tone', () => {
    const { container, rerender } = render(<Badge tone="success">Otevřeno</Badge>);
    expect(container.firstElementChild).toHaveClass('bg-brand-green-100');

    rerender(<Badge tone="danger">Zavřeno</Badge>);
    expect(container.firstElementChild).toHaveClass('bg-danger-100');
  });

  it('defaults to the neutral tone', () => {
    const { container } = render(<Badge>Nezměněno</Badge>);

    expect(container.firstElementChild).toHaveClass('bg-bg-muted');
  });

  it('passes attributes and caller classes through', () => {
    render(
      <Badge className="custom-class" data-testid="badge" title="Popisek">
        Otevřeno
      </Badge>
    );

    const badge = screen.getByTestId('badge');
    expect(badge).toHaveClass('custom-class');
    expect(badge).toHaveAttribute('title', 'Popisek');
  });
});
