import { render, screen } from '@testing-library/react';

import { Avatar } from './avatar';

describe('Avatar', () => {
  it('draws the initials it is given', () => {
    render(<Avatar initials="KZ" />);

    expect(screen.getByText('KZ')).toBeInTheDocument();
  });

  it('is an image with an accessible name when labelled', () => {
    render(<Avatar initials="KZ" label="Karel Zíbar" />);

    expect(screen.getByRole('img', { name: 'Karel Zíbar' })).toBeInTheDocument();
  });

  it('is hidden from assistive technology when unlabelled', () => {
    const { container } = render(<Avatar initials="KZ" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders one colour pair per tone', () => {
    const { container, rerender } = render(<Avatar initials="KZ" tone="dark" />);
    expect(container.firstElementChild).toHaveClass('bg-bg-inverse');

    rerender(<Avatar initials="KZ" tone="info" />);
    expect(container.firstElementChild).toHaveClass('bg-brand-blue-100');
  });

  it('renders one diameter per size', () => {
    const { container, rerender } = render(<Avatar initials="KZ" size="sm" />);
    expect(container.firstElementChild).toHaveClass('size-6');

    rerender(<Avatar initials="KZ" size="lg" />);
    expect(container.firstElementChild).toHaveClass('size-10');
  });

  it('passes caller classes through', () => {
    const { container } = render(<Avatar initials="KZ" className="custom-class" />);

    expect(container.firstElementChild).toHaveClass('custom-class');
  });
});
