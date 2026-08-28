import type { Meta, StoryObj } from '@storybook/react-vite';

import { Radio, RadioGroup } from './radio';

const meta: Meta<typeof Radio> = {
  title: 'Primitives/Radio',
  component: Radio,
  args: { name: 'demo', label: 'První možnost' },
};

export default meta;
type Story = StoryObj<typeof Radio>;

export const Default: Story = {};

export const Checked: Story = {
  args: { defaultChecked: true },
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      <Radio {...args} disabled label="Vypnuté, nevybrané" />
      <Radio {...args} name="demo-disabled" disabled defaultChecked label="Vypnuté, vybrané" />
    </div>
  ),
};

/**
 * Radios belong in a group. `RadioGroup` gives the set one accessible name;
 * inside it the arrow keys move the selection, as the platform intends.
 */
export const InAGroup: Story = {
  render: () => (
    <RadioGroup legend="Jak často posílat souhrn" hint="Změnit můžeš kdykoli.">
      <Radio name="frequency" value="daily" label="Denně" defaultChecked />
      <Radio name="frequency" value="weekly" label="Týdně" />
      <Radio name="frequency" value="never" label="Vůbec" />
    </RadioGroup>
  ),
};

export const GroupError: Story = {
  render: () => (
    <RadioGroup legend="Jak často posílat souhrn" error="Vyber prosím jednu možnost.">
      <Radio name="frequency-error" value="daily" label="Denně" />
      <Radio name="frequency-error" value="weekly" label="Týdně" />
    </RadioGroup>
  ),
};

export const HorizontalGroup: Story = {
  render: () => (
    <RadioGroup legend="Zobrazení" horizontal>
      <Radio name="layout" value="grid" label="Mřížka" defaultChecked />
      <Radio name="layout" value="list" label="Seznam" />
    </RadioGroup>
  ),
};
