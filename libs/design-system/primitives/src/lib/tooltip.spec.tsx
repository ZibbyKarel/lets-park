import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Tooltip } from './tooltip';

describe('Tooltip', () => {
  it('shows nothing until it is asked to', () => {
    render(
      <Tooltip content="Zamčeno správcem">
        <button type="button">Potvrdit</button>
      </Tooltip>
    );

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Potvrdit' })).not.toHaveAccessibleDescription();
  });

  it('opens on keyboard focus, not only on hover', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Před</button>
        <Tooltip content="Zamčeno správcem">
          <button type="button">Potvrdit</button>
        </Tooltip>
      </div>
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Před' })).toHaveFocus();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    await user.tab();

    expect(screen.getByRole('button', { name: 'Potvrdit' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toHaveTextContent('Zamčeno správcem');
  });

  it('describes the trigger itself while it is visible', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Zamčeno správcem">
        <button type="button">Potvrdit</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Potvrdit' });
    await user.tab();

    // The description must be resolvable from the trigger, not from a wrapper:
    // assistive technology reads aria-describedby off the focused element.
    expect(trigger).toHaveAccessibleDescription('Zamčeno správcem');
    // ...and it must be a description, never the name.
    expect(trigger).toHaveAccessibleName('Potvrdit');

    await user.tab();
    expect(trigger).not.toHaveAccessibleDescription();
  });

  it('keeps a description the caller already set, instead of overwriting it', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <span id="vlastni-popis">Vlastní popis</span>
        <Tooltip content="Zamčeno správcem">
          <button type="button" aria-describedby="vlastni-popis">
            Potvrdit
          </button>
        </Tooltip>
      </div>
    );

    const trigger = screen.getByRole('button', { name: 'Potvrdit' });
    expect(trigger).toHaveAccessibleDescription('Vlastní popis');

    await user.tab();
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAccessibleDescription('Vlastní popis Zamčeno správcem');
  });

  it('closes when focus leaves', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Tooltip content="Zamčeno správcem">
          <button type="button">Potvrdit</button>
        </Tooltip>
        <button type="button">Za</button>
      </div>
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Potvrdit' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await user.tab();

    expect(screen.getByRole('button', { name: 'Za' })).toHaveFocus();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('opens on hover and closes when the pointer leaves', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Zamčeno správcem">
        <button type="button">Potvrdit</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Potvrdit' });

    await user.hover(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await user.unhover(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('dismisses on Escape without moving focus away from the trigger', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Zamčeno správcem">
        <button type="button">Potvrdit</button>
      </Tooltip>
    );

    const trigger = screen.getByRole('button', { name: 'Potvrdit' });
    await user.tab();
    expect(trigger).toHaveFocus();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('dismisses on Escape even when it was opened by hover with focus elsewhere (WCAG 1.4.13)', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Jinde</button>
        <Tooltip content="Zamčeno správcem">
          <button type="button">Potvrdit</button>
        </Tooltip>
      </div>
    );

    const elsewhere = screen.getByRole('button', { name: 'Jinde' });
    const trigger = screen.getByRole('button', { name: 'Potvrdit' });

    elsewhere.focus();
    await user.hover(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(elsewhere).toHaveFocus();

    // Escape reaches the tooltip via a document-level listener, not one on the
    // trigger — a wrapper-level handler would never see this, because focus
    // never moved to the trigger in the first place.
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(elsewhere).toHaveFocus();
  });

  it('never takes focus itself', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <Tooltip content="Zamčeno správcem">
          <button type="button">Potvrdit</button>
        </Tooltip>
        <button type="button">Za</button>
      </div>
    );

    await user.tab();
    expect(screen.getByRole('button', { name: 'Potvrdit' })).toHaveFocus();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    // Tab goes past the bubble straight to the next control: the tooltip adds
    // no stop of its own to the tab order.
    await user.tab();

    expect(screen.getByRole('button', { name: 'Za' })).toHaveFocus();
  });

  it('also describes a non-button trigger, such as a field', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Formát REF-4821">
        <input aria-label="Kód" />
      </Tooltip>
    );

    const input = screen.getByLabelText('Kód');
    await user.click(input);

    expect(input).toHaveFocus();
    expect(input).toHaveAccessibleDescription('Formát REF-4821');
  });
});
