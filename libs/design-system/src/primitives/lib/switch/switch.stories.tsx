import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Switch } from './switch';

const meta: Meta<typeof Switch> = {
  title: 'Primitives/Switch',
  component: Switch,
  args: { label: 'Správce' },
};

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {};

export const On: Story = {
  args: { defaultChecked: true },
};

export const Tones: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Switch defaultChecked label="Modrá (info)" tone="info" />
      <Switch defaultChecked label="Zelená (success)" tone="success" />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      <Switch disabled label="Vypnuté, neaktivní" />
      <Switch disabled defaultChecked label="Vypnuté, aktivní" />
    </div>
  ),
};

/** Without a visible label the caller must pass `aria-label`. */
export const WithoutLabel: Story = {
  args: { label: undefined, 'aria-label': 'Přepnout zobrazení' },
};

function ControlledDemo() {
  const [on, setOn] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <Switch checked={on} onCheckedChange={setOn} label="Řízeno zvenčí" />
      <p className="text-sm text-fg-3">Stav: {on ? 'zapnuto' : 'vypnuto'}</p>
    </div>
  );
}

/** Tab to focus, then Enter nebo mezerník to toggle. */
export const Controlled: Story = {
  render: () => <ControlledDemo />,
};
