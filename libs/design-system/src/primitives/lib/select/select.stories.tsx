import type { Meta, StoryObj } from '@storybook/react-vite';

import type { ControlSize } from '../control-size';
import { Select } from './select';

const SIZES: ControlSize[] = ['sm', 'md', 'lg', 'xl'];

const options = (
  <>
    <option value="a">První možnost</option>
    <option value="b">Druhá možnost</option>
    <option value="c">Třetí možnost</option>
  </>
);

const meta: Meta<typeof Select> = {
  title: 'Primitives/Select',
  component: Select,
  args: { label: 'Možnost', size: 'md', children: options },
  argTypes: { size: { control: 'inline-radio', options: SIZES } },
  decorators: [
    (Story) => (
      <div className="max-w-96">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Select>;

export const Default: Story = {};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-5">
      {SIZES.map((size) => (
        <Select key={size} {...args} size={size} label={size} />
      ))}
    </div>
  ),
};

export const WithHint: Story = {
  args: { hint: 'Můžeš změnit kdykoli později.' },
};

export const Error: Story = {
  args: { error: 'Vyber prosím jednu možnost.' },
};

export const Disabled: Story = {
  args: { disabled: true },
};

/**
 * A native `<select>`, so the whole keyboard contract works: Tab to focus,
 * arrows or type-ahead to move, Home/End to jump, Enter/Escape to close.
 */
export const KeyboardOperation: Story = {
  args: { label: 'Ovládej klávesnicí' },
};
