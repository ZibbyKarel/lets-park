import type { Meta, StoryObj } from '@storybook/react-vite';

import { Divider } from './divider';

const meta: Meta<typeof Divider> = {
  title: 'Primitives/Divider',
  component: Divider,
};

export default meta;
type Story = StoryObj<typeof Divider>;

export const Horizontal: Story = {
  render: (args) => (
    <div className="w-64">
      <p className="text-sm">Nad čárou</p>
      <Divider {...args} />
      <p className="text-sm">Pod čárou</p>
    </div>
  ),
};

export const HorizontalWithSpacing: Story = {
  args: { spacing: 6 },
  render: (args) => (
    <div className="w-64">
      <p className="text-sm">Nad čárou</p>
      <Divider {...args} />
      <p className="text-sm">Pod čárou</p>
    </div>
  ),
};

export const DividerTone: Story = {
  args: { tone: 'divider' },
  render: (args) => (
    <div className="w-64">
      <p className="text-sm">Nad čárou</p>
      <Divider {...args} />
      <p className="text-sm">Pod čárou</p>
    </div>
  ),
};

export const Vertical: Story = {
  args: { orientation: 'vertical' },
  render: (args) => (
    <div className="flex h-12 items-center">
      <p className="text-sm">Vlevo</p>
      <Divider {...args} />
      <p className="text-sm">Vpravo</p>
    </div>
  ),
};
