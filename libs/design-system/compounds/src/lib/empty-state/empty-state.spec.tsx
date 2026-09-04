import { render, screen } from '@testing-library/react';

import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders the title as a paragraph, not a heading, by default', () => {
    render(<EmptyState title="Nic tu není" />);

    expect(screen.getByText('Nic tu není')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });

  it.each([2, 3, 4] as const)('renders the title as an h%i when asked', (level) => {
    render(<EmptyState title="Nic tu není" headingLevel={level} />);

    expect(screen.getByRole('heading', { level, name: 'Nic tu není' })).toBeInTheDocument();
  });

  it('renders the description and the action', () => {
    render(
      <EmptyState
        title="Nic tu není"
        description="Zkuste změnit filtr."
        action={<button type="button">Přidat</button>}
      />
    );

    expect(screen.getByText('Zkuste změnit filtr.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Přidat' })).toBeInTheDocument();
  });

  it('omits the description and the action when they are not given', () => {
    render(<EmptyState title="Nic tu není" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // The title is the only text node in the block.
    expect(screen.getByText('Nic tu není').parentElement?.childElementCount).toBe(1);
  });

  it('hides the icon from assistive technology', () => {
    render(<EmptyState title="Nic tu není" icon={<svg data-testid="mark" />} />);

    const icon = screen.getByTestId('mark').parentElement;

    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });
});
