import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './button';
import { Dropdown } from './dropdown';
import { Input } from './input';
import { Tooltip } from './tooltip';

const meta: Meta<typeof Tooltip> = {
  title: 'Primitives/Tooltip',
  component: Tooltip,
  args: { content: 'Zamčeno správcem do konce týdne.', placement: 'top' },
  argTypes: {
    placement: { control: 'inline-radio', options: ['top', 'bottom'] },
  },
  // Room above and below, so the `top` placement is not clipped by the canvas.
  decorators: [
    (Story) => (
      <div className="flex min-h-40 items-center justify-center">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tooltip>;

/**
 * Reachable by keyboard, not only by hover: press Tab to focus the button and
 * the bubble appears. Escape dismisses it without moving focus.
 */
export const Default: Story = {
  render: (args) => (
    <Tooltip {...args}>
      <Button variant="secondary">Potvrdit</Button>
    </Tooltip>
  ),
};

export const Below: Story = {
  args: { placement: 'bottom' },
  render: (args) => (
    <Tooltip {...args}>
      <Button variant="secondary">Potvrdit</Button>
    </Tooltip>
  ),
};

/** Long text wraps at `--tooltip-max-w` rather than running off the screen. */
export const LongText: Story = {
  args: {
    content:
      'Tato položka je zamčená správcem. Úpravy budou možné znovu od pondělí, kdy skončí údržba.',
  },
  render: (args) => (
    <Tooltip {...args}>
      <Button variant="secondary">Potvrdit</Button>
    </Tooltip>
  ),
};

/** It describes any focusable element, not just buttons. */
export const OnAField: Story = {
  args: { content: 'Formát REF-4821.' },
  render: (args) => (
    <div className="w-80">
      <Tooltip {...args}>
        <Input label="Kód" defaultValue="REF-4821" />
      </Tooltip>
    </div>
  ),
};

/**
 * Escape belongs to whatever holds the keyboard, not to whatever appeared last.
 *
 * To try it: open the menu with the button on the left (the arrow keys move
 * between its items), then rest the mouse on the trigger on the right so its
 * bubble appears without taking focus. The first Escape closes the **menu**,
 * because that is where the keyboard is; the second closes the bubble. See
 * `doc/decision/0024-escape-goes-to-the-innermost-open-layer.md`.
 */
export const EscapeAgainstAnOpenMenu: Story = {
  render: (args) => (
    <div className="flex items-center gap-8">
      <Dropdown
        trigger="Nabídka"
        items={[
          { id: 'edit', label: 'Upravit' },
          { id: 'copy', label: 'Duplikovat' },
        ]}
      />
      <Tooltip {...args} content="Zobrazí se při najetí myší.">
        <Button variant="secondary">Detail</Button>
      </Tooltip>
    </div>
  ),
};

/** Several triggers in a row, to check that only the hovered one opens. */
export const SeveralInARow: Story = {
  render: (args) => (
    <div className="flex gap-4">
      <Tooltip {...args} content="První popis">
        <Button variant="secondary">První</Button>
      </Tooltip>
      <Tooltip {...args} content="Druhý popis">
        <Button variant="secondary">Druhý</Button>
      </Tooltip>
      <Tooltip {...args} content="Třetí popis">
        <Button variant="secondary">Třetí</Button>
      </Tooltip>
    </div>
  ),
};
