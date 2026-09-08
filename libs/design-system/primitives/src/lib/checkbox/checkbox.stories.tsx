import type { Meta, StoryObj } from '@storybook/react-vite';

import { Checkbox } from './checkbox';

const meta: Meta<typeof Checkbox> = {
  title: 'Primitives/Checkbox',
  component: Checkbox,
  args: { label: 'Posílat upozornění' },
};

export default meta;
type Story = StoryObj<typeof Checkbox>;

export const Default: Story = {};

export const Checked: Story = {
  args: { defaultChecked: true },
};

/** The mixed state — a group where only some children are selected. */
export const Indeterminate: Story = {
  args: { indeterminate: true, label: 'Vybrané položky' },
};

export const WithHint: Story = {
  args: { hint: 'Upozornění chodí e-mailem.' },
};

export const Error: Story = {
  args: { error: 'Tuhle volbu je nutné potvrdit.' },
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-col gap-4">
      <Checkbox {...args} disabled label="Vypnuté, nezaškrtnuté" />
      <Checkbox {...args} disabled defaultChecked label="Vypnuté, zaškrtnuté" />
    </div>
  ),
};

/** Tab to focus, Space to toggle — the label toggles it too. */
export const Focus: Story = {
  args: { label: 'Zmáčkni Tab a mezerník' },
};
