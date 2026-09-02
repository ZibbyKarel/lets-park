import { useRef, useState, type ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { useDismissableLayer } from './dismissable-layer';
import { Dropdown, type DropdownItem } from './dropdown';
import { Tooltip } from './tooltip';

const ITEMS: DropdownItem[] = [
  { id: 'a', label: 'První' },
  { id: 'b', label: 'Druhá' },
];

/**
 * A layer with no styling, no roles and no behaviour of its own, so the tests
 * below are about the set and nothing else. Its wrapper stays mounted whether
 * the layer is open or not, which is how the real overlays behave too.
 */
function ProbeLayer({
  name,
  open,
  onDismiss,
  children,
}: {
  name: string;
  open: boolean;
  onDismiss: () => void;
  children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismissableLayer({ active: open, elementRef: ref, onDismiss });

  return (
    <div ref={ref}>
      {open ? <p>{name} otevřeno</p> : null}
      <button type="button">Prvek v {name}</button>
      {children}
    </div>
  );
}

type Names = 'A' | 'B' | 'C';

function useOpenSet(initial: Record<Names, boolean>) {
  const [open, setOpen] = useState(initial);
  const close = (name: Names) => () => setOpen((previous) => ({ ...previous, [name]: false }));

  return { open, close };
}

describe('the dismissable layer set', () => {
  it('gives each Escape to the last layer registered, one layer at a time', async () => {
    const user = userEvent.setup();

    function Siblings() {
      const { open, close } = useOpenSet({ A: true, B: true, C: true });
      return (
        <div>
          <ProbeLayer name="A" open={open.A} onDismiss={close('A')} />
          <ProbeLayer name="B" open={open.B} onDismiss={close('B')} />
          <ProbeLayer name="C" open={open.C} onDismiss={close('C')} />
        </div>
      );
    }

    render(<Siblings />);

    await user.keyboard('{Escape}');
    expect(screen.queryByText('C otevřeno')).not.toBeInTheDocument();
    expect(screen.getByText('B otevřeno')).toBeInTheDocument();
    expect(screen.getByText('A otevřeno')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('B otevřeno')).not.toBeInTheDocument();
    expect(screen.getByText('A otevřeno')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('A otevřeno')).not.toBeInTheDocument();

    // Nothing left to dismiss, and no listener left behind to throw.
    await user.keyboard('{Escape}');
  });

  it('survives a layer in the middle of the set closing on its own account', async () => {
    const user = userEvent.setup();

    function Siblings() {
      const { open, close } = useOpenSet({ A: true, B: true, C: true });
      return (
        <div>
          <ProbeLayer name="A" open={open.A} onDismiss={close('A')} />
          <ProbeLayer name="B" open={open.B} onDismiss={close('B')} />
          <button type="button" onClick={close('B')}>
            Zavřít B
          </button>
          <ProbeLayer name="C" open={open.C} onDismiss={close('C')} />
        </div>
      );
    }

    render(<Siblings />);

    await user.click(screen.getByRole('button', { name: 'Zavřít B' }));
    expect(screen.queryByText('B otevřeno')).not.toBeInTheDocument();

    // The set is now [A, C] with C still last: the out-of-order removal must
    // not have shuffled anything.
    await user.keyboard('{Escape}');
    expect(screen.queryByText('C otevřeno')).not.toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('A otevřeno')).not.toBeInTheDocument();
  });

  it('drops a layer that unmounts while still open', async () => {
    const user = userEvent.setup();

    function Siblings() {
      const { open, close } = useOpenSet({ A: true, B: true, C: true });
      const [mounted, setMounted] = useState(true);

      return (
        <div>
          <ProbeLayer name="A" open={open.A} onDismiss={close('A')} />
          <button type="button" onClick={() => setMounted(false)}>
            Odebrat C
          </button>
          {mounted ? <ProbeLayer name="C" open={open.C} onDismiss={close('C')} /> : null}
        </div>
      );
    }

    render(<Siblings />);

    // C is removed from the tree without its `open` ever going false — the
    // cleanup, not the state change, has to take it out of the set.
    await user.click(screen.getByRole('button', { name: 'Odebrat C' }));

    await user.keyboard('{Escape}');
    expect(screen.queryByText('A otevřeno')).not.toBeInTheDocument();
  });

  it('gives Escape to the layer nested inside another, even when that one registered first', async () => {
    const user = userEvent.setup();

    function Nested() {
      const [inner, setInner] = useState(false);
      const [outer, setOuter] = useState(false);

      return (
        <div>
          <button type="button" onClick={() => setInner(true)}>
            Otevřít vnitřní
          </button>
          <button type="button" onClick={() => setOuter(true)}>
            Otevřít vnější
          </button>
          <ProbeLayer name="A" open={outer} onDismiss={() => setOuter(false)}>
            <ProbeLayer name="C" open={inner} onDismiss={() => setInner(false)} />
          </ProbeLayer>
        </div>
      );
    }

    render(<Nested />);

    // Registration order is inner-then-outer, so last-registered-wins would
    // pick the outer one. Containment has to override that.
    await user.click(screen.getByRole('button', { name: 'Otevřít vnitřní' }));
    await user.click(screen.getByRole('button', { name: 'Otevřít vnější' }));

    await user.keyboard('{Escape}');
    expect(screen.queryByText('C otevřeno')).not.toBeInTheDocument();
    expect(screen.getByText('A otevřeno')).toBeInTheDocument();
  });

  it('gives Escape to whichever unrelated sibling holds the keyboard', async () => {
    const user = userEvent.setup();

    function Siblings() {
      const { open, close } = useOpenSet({ A: true, B: false, C: true });
      return (
        <div>
          <ProbeLayer name="A" open={open.A} onDismiss={close('A')} />
          <ProbeLayer name="C" open={open.C} onDismiss={close('C')} />
        </div>
      );
    }

    render(<Siblings />);

    // A registered first, so last-registered-wins would pick C. Focus in A
    // has to override that.
    screen.getByRole('button', { name: 'Prvek v A' }).focus();

    await user.keyboard('{Escape}');
    expect(screen.queryByText('A otevřeno')).not.toBeInTheDocument();
    expect(screen.getByText('C otevřeno')).toBeInTheDocument();
  });

  it('binds one document listener for the whole set, and releases it when the set empties', () => {
    const add = jest.spyOn(document, 'addEventListener');
    const remove = jest.spyOn(document, 'removeEventListener');

    function Siblings() {
      const { open, close } = useOpenSet({ A: true, B: true, C: true });
      return (
        <div>
          <ProbeLayer name="A" open={open.A} onDismiss={close('A')} />
          <ProbeLayer name="B" open={open.B} onDismiss={close('B')} />
          <ProbeLayer name="C" open={open.C} onDismiss={close('C')} />
        </div>
      );
    }

    const { unmount } = render(<Siblings />);

    expect(add.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);

    unmount();

    expect(remove.mock.calls.filter(([type]) => type === 'keydown')).toHaveLength(1);

    add.mockRestore();
    remove.mockRestore();
  });
});

describe('Escape across sibling layers', () => {
  it('closes the menu the keyboard is in, not an unrelated hovered tooltip', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <Dropdown trigger="Menu" items={ITEMS} />
        <Tooltip content="Nápověda">
          <button type="button">Detail</button>
        </Tooltip>
      </div>
    );

    await user.click(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // Hover moves the pointer but not the keyboard: focus stays on the menu
    // item, so an Escape now is unambiguously aimed at the menu.
    await user.hover(screen.getByRole('button', { name: 'Detail' }));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'První' })).toHaveFocus();

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    // And the tooltip is still reachable by a second press — nothing has been
    // swallowed permanently.
    await user.keyboard('{Escape}');

    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('closes the focused tooltip rather than the one merely hovered', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <Tooltip content="Popis alfa">
          <button type="button">Alfa</button>
        </Tooltip>
        <Tooltip content="Popis beta">
          <button type="button">Beta</button>
        </Tooltip>
      </div>
    );

    // Tab rather than click: the pointer must never visit the first trigger,
    // or leaving it would hide its bubble again. Focus opens the first bubble;
    // hovering the second opens that one too and registers it later, without
    // taking the keyboard off the first trigger.
    await user.tab();
    await user.hover(screen.getByRole('button', { name: 'Beta' }));
    expect(screen.getByText('Popis alfa')).toBeInTheDocument();
    expect(screen.getByText('Popis beta')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alfa' })).toHaveFocus();

    await user.keyboard('{Escape}');

    // The tooltip wrapper contains its own trigger, which is how the set can
    // tell a focus-opened bubble from a hover-opened one.
    expect(screen.queryByText('Popis alfa')).not.toBeInTheDocument();
    expect(screen.getByText('Popis beta')).toBeInTheDocument();
  });
});
