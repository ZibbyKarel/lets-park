import type { Meta, StoryObj } from '@storybook/react-vite';

import { Box, type BoxBackground } from './box';

const BACKGROUNDS: BoxBackground[] = ['bg', 'bg-soft', 'bg-muted'];

const meta: Meta<typeof Box> = {
  title: 'Primitives/Box',
  component: Box,
  args: { padding: 4, border: true, radius: 'md' },
};

export default meta;
type Story = StoryObj<typeof Box>;

export const Default: Story = {
  render: (args) => <Box {...args}>Obsah</Box>,
};

/** The three `bg-*` backgrounds side by side. */
export const Backgrounds: Story = {
  render: (args) => (
    <div className="flex gap-4">
      {BACKGROUNDS.map((background) => (
        <Box key={background} {...args} background={background}>
          {background}
        </Box>
      ))}
    </div>
  ),
};

export const WithMargin: Story = {
  args: { margin: 6, background: 'bg-soft' },
  render: (args) => (
    <div className="bg-bg-muted">
      <Box {...args}>Obsah s marginem</Box>
    </div>
  ),
};
