import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Button } from './button';

describe('Button', () => {
  it('renders a real button that defaults to type="button"', () => {
    render(<Button>Uložit</Button>);

    const button = screen.getByRole('button', { name: 'Uložit' });
    expect(button).toBeInTheDocument();
    // Without this a button inside a form would submit it by accident.
    expect(button).toHaveAttribute('type', 'button');
  });

  it('calls onClick on pointer and on keyboard activation', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Uložit</Button>);

    const button = screen.getByRole('button', { name: 'Uložit' });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);

    button.focus();
    await user.keyboard('{Enter}');
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(3);
  });

  it('is reachable with Tab', async () => {
    const user = userEvent.setup();
    render(<Button>Uložit</Button>);

    await user.tab();

    expect(screen.getByRole('button', { name: 'Uložit' })).toHaveFocus();
  });

  it('does not fire and cannot be focused when disabled', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(
      <Button disabled onClick={onClick}>
        Uložit
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Uložit' });
    await user.click(button);

    expect(onClick).not.toHaveBeenCalled();
    expect(button).toBeDisabled();

    await user.tab();
    expect(button).not.toHaveFocus();
  });

  it('announces and blocks interaction while loading', async () => {
    const user = userEvent.setup();
    const onClick = jest.fn();
    render(
      <Button loading onClick={onClick}>
        Ukládám
      </Button>
    );

    const button = screen.getByRole('button', { name: 'Ukládám' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();

    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('hides the spinner from assistive technology and drops it when idle', () => {
    const { rerender } = render(<Button loading>Ukládám</Button>);

    const spinner = screen.getByTestId('button-spinner');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');

    rerender(<Button>Ukládám</Button>);
    expect(screen.queryByTestId('button-spinner')).not.toBeInTheDocument();
  });

  it('drops the adornments while loading so the spinner takes their place', () => {
    render(
      <Button loading startAdornment={<span data-testid="start" />}>
        Ukládám
      </Button>
    );

    expect(screen.queryByTestId('start')).not.toBeInTheDocument();
  });

  it('swaps the variant classes out entirely when disabled', () => {
    const { rerender } = render(<Button variant="primary">Uložit</Button>);
    const enabled = screen.getByRole('button').className;

    rerender(
      <Button variant="primary" disabled>
        Uložit
      </Button>
    );
    const disabled = screen.getByRole('button').className;

    expect(enabled).toContain('bg-brand-blue');
    // The point of computing this in JS: no variant class survives to fight
    // the disabled styling in the cascade.
    expect(disabled).not.toContain('bg-brand-blue');
    expect(disabled).toContain('bg-bg-muted');
  });

  it('forwards a ref to the underlying element', () => {
    const ref = { current: null as HTMLButtonElement | null };
    render(<Button ref={ref}>Uložit</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('keeps caller classes alongside its own', () => {
    render(<Button className="custom-class">Uložit</Button>);

    expect(screen.getByRole('button')).toHaveClass('custom-class');
  });
});
