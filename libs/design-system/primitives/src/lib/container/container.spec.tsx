import { render, screen } from '@testing-library/react';

import { Container } from './container';

describe('Container', () => {
  it('defaults to the base max-width and the [8, 4] padding matching app/(app)/layout.tsx', () => {
    render(<Container data-testid="container">content</Container>);

    const container = screen.getByTestId('container');
    expect(container).toHaveClass('mx-auto', 'w-full', 'max-w-[var(--container)]', 'py-8', 'px-4');
  });

  it('switches to the wide max-width', () => {
    render(<Container data-testid="container" maxWidth="wide" />);

    // Consumed as an arbitrary value off the raw CSS variable, never
    // `max-w-container-wide` — see the comment in container.tsx.
    expect(screen.getByTestId('container')).toHaveClass('max-w-[var(--container-wide)]');
  });

  it('resolves a custom padding shorthand', () => {
    render(<Container data-testid="container" padding={0} />);

    expect(screen.getByTestId('container')).toHaveClass('p-0');
  });

  it('keeps caller classes alongside its own', () => {
    render(<Container data-testid="container" className="custom-class" />);

    expect(screen.getByTestId('container')).toHaveClass('custom-class');
  });

  it('forwards a ref to the underlying element', () => {
    const ref = { current: null as HTMLDivElement | null };
    render(<Container ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLDivElement);
  });

  it('renders its children', () => {
    render(<Container>hello</Container>);

    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
