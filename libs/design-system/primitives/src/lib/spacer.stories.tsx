import type { Meta, StoryObj } from '@storybook/react-vite';

import { Spacer } from './spacer';
import { Stack } from './stack';

const meta: Meta<typeof Spacer> = {
  title: 'Primitives/Spacer',
  component: Spacer,
};

export default meta;
type Story = StoryObj<typeof Spacer>;

/** No `size`: grows (`flex-1`) to push the toolbar items apart. */
export const Flexible: Story = {
  render: (args) => (
    <Stack direction="row" align="center" className="w-96 rounded-md border border-border p-2">
      <span className="text-sm">Vlevo</span>
      <Spacer {...args} />
      <span className="text-sm">Vpravo</span>
    </Stack>
  ),
};

/** A fixed-size gap instead of a growing one. */
export const FixedSize: Story = {
  args: { size: 8 },
  render: (args) => (
    <Stack direction="row" align="center" className="rounded-md border border-border p-2">
      <span className="text-sm">Vlevo</span>
      <Spacer {...args} />
      <span className="text-sm">Vpravo</span>
    </Stack>
  ),
};
