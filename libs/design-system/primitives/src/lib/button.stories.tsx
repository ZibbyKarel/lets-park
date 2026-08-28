import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button, type ButtonVariant } from './button';
import type { ControlSize } from './control-size';

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'outline', 'danger', 'ghost'];
const SIZES: ControlSize[] = ['sm', 'md', 'lg', 'xl'];

const meta: Meta<typeof Button> = {
  title: 'Primitives/Button',
  component: Button,
  args: { children: 'Uložit', variant: 'primary', size: 'md' },
  argTypes: {
    variant: { control: 'inline-radio', options: VARIANTS },
    size: { control: 'inline-radio', options: SIZES },
  },
};

export default meta;
type Story = StoryObj<typeof Button>;

export const Default: Story = {};

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-4">
      {VARIANTS.map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-4">
      {SIZES.map((size) => (
        <Button key={size} {...args} size={size}>
          {size}
        </Button>
      ))}
    </div>
  ),
};

/**
 * Hover and focus are pseudo-states, so they cannot be forced from props —
 * point at a button and press Tab to see them. The focus ring is the same on
 * every variant on purpose.
 */
export const HoverAndFocus: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-4">
      {VARIANTS.map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          Najeď / Tab
        </Button>
      ))}
    </div>
  ),
};

export const Disabled: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-4">
      {VARIANTS.map((variant) => (
        <Button key={variant} {...args} variant={variant} disabled>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

/** Blocks interaction and announces `aria-busy` without changing width. */
export const Loading: Story = {
  args: { loading: true, children: 'Ukládám' },
};

export const FullWidth: Story = {
  args: { fullWidth: true, size: 'lg' },
  render: (args) => (
    <div className="max-w-96">
      <Button {...args} />
    </div>
  ),
};
