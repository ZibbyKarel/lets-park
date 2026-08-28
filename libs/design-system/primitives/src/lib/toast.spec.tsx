import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Toast, ToastRegion, type ToastTone } from './toast';

describe('Toast', () => {
  it('is a polite live region by default, so it is announced without interrupting', () => {
    render(<Toast>Změny uloženy.</Toast>);

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Změny uloženy.');
  });

  it('escalates to an assertive alert for the danger tone only', () => {
    const { rerender } = render(<Toast tone="danger">Uložení selhalo.</Toast>);
    expect(screen.getByRole('alert')).toHaveTextContent('Uložení selhalo.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();

    for (const tone of ['neutral', 'info', 'success', 'warning'] as ToastTone[]) {
      rerender(<Toast tone={tone}>Zpráva.</Toast>);
      expect(screen.getByRole('status')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    }
  });

  it('does not take focus when it appears', async () => {
    const user = userEvent.setup();

    function Host() {
      const [shown, setShown] = useState(false);

      return (
        <div>
          <button type="button" onClick={() => setShown(true)}>
            Uložit
          </button>
          <ToastRegion label="Oznámení">
            {shown ? <Toast onDismiss={() => setShown(false)}>Uloženo.</Toast> : null}
          </ToastRegion>
        </div>
      );
    }

    render(<Host />);
    const trigger = screen.getByRole('button', { name: 'Uložit' });

    await user.click(trigger);

    expect(screen.getByRole('status')).toBeInTheDocument();
    // The whole point of a toast: the user carries on where they were.
    expect(trigger).toHaveFocus();
  });

  it('renders a dismiss button only when it can be dismissed', async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();

    const { rerender } = render(<Toast>Uloženo.</Toast>);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<Toast onDismiss={onDismiss}>Uloženo.</Toast>);
    await user.click(screen.getByRole('button', { name: 'Zavřít' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('gives the dismiss button a spoken name, and takes a Czech override', () => {
    render(
      <Toast onDismiss={jest.fn()} dismissLabel="Skrýt oznámení">
        Uloženo.
      </Toast>
    );

    expect(screen.getByRole('button', { name: 'Skrýt oznámení' })).toBeInTheDocument();
  });

  it('reaches the dismiss button by keyboard and fires it with Enter', async () => {
    const user = userEvent.setup();
    const onDismiss = jest.fn();
    render(<Toast onDismiss={onDismiss}>Uloženo.</Toast>);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Zavřít' })).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('shows the title and message as one announcement', () => {
    render(<Toast title="Uloženo">Změny se projeví zítra.</Toast>);

    const toast = screen.getByRole('status');
    expect(toast).toHaveTextContent('Uloženo');
    expect(toast).toHaveTextContent('Změny se projeví zítra.');
  });

  it('hides a decorative icon from assistive technology', () => {
    render(
      <Toast icon="!" title="Pozor">
        Něco se stalo.
      </Toast>
    );

    // The glyph must not be read out — it repeats what the tone already says.
    // `aria-hidden` is the contract; `textContent` still contains it, which is
    // exactly why asserting on text would prove nothing here.
    expect(screen.getByText('!')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('status')).toHaveAccessibleName('');
  });
});

describe('ToastRegion', () => {
  it('is a named region that exists even while empty', () => {
    render(<ToastRegion label="Oznámení" />);

    // A live region has to be in the DOM *before* the message arrives, or the
    // message is frequently never announced — so the empty region is the point.
    expect(screen.getByRole('region', { name: 'Oznámení' })).toBeInTheDocument();
  });

  it('is not itself a live region, so a toast is not announced twice', () => {
    render(
      <ToastRegion label="Oznámení">
        <Toast>Uloženo.</Toast>
      </ToastRegion>
    );

    const region = screen.getByRole('region', { name: 'Oznámení' });
    expect(region).not.toHaveAttribute('aria-live');
    expect(region).not.toHaveAttribute('role', 'status');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('lets clicks through the empty space around the stack', () => {
    render(
      <ToastRegion label="Oznámení">
        <Toast>Uloženo.</Toast>
      </ToastRegion>
    );

    const region = screen.getByRole('region', { name: 'Oznámení' });
    expect(region.className).toContain('pointer-events-none');
    expect(screen.getByRole('status').parentElement?.className).toContain('pointer-events-auto');
  });

  it('stacks several toasts', () => {
    render(
      <ToastRegion label="Oznámení">
        <Toast>První.</Toast>
        <Toast tone="success">Druhá.</Toast>
        <Toast tone="danger">Třetí.</Toast>
      </ToastRegion>
    );

    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });
});
