import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar, type AvatarSize, type AvatarTone } from './avatar';

const TONES: AvatarTone[] = ['dark', 'info', 'neutral', 'warning'];
const SIZES: AvatarSize[] = ['sm', 'md', 'lg'];

const meta: Meta<typeof Avatar> = {
  title: 'Primitives/Avatar',
  component: Avatar,
  args: { initials: 'KZ', tone: 'neutral', size: 'md' },
  argTypes: {
    tone: { control: 'inline-radio', options: TONES },
    size: { control: 'inline-radio', options: SIZES },
  },
};

export default meta;
type Story = StoryObj<typeof Avatar>;

export const Default: Story = {};

export const Tones: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {TONES.map((tone) => (
        <Avatar key={tone} {...args} tone={tone} />
      ))}
    </div>
  ),
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      {SIZES.map((size) => (
        <Avatar key={size} {...args} size={size} />
      ))}
    </div>
  ),
};

/**
 * With `label` the avatar is an image with an accessible name; without it, it
 * is hidden from assistive technology on the assumption the name is already
 * written next to it.
 */
export const Labelled: Story = {
  args: { label: 'Karel Zíbar', tone: 'info' },
};

export const NextToText: Story = {
  render: (args) => (
    <span className="inline-flex items-center gap-3 text-sm text-fg">
      <Avatar {...args} tone="info" />
      Karel Zíbar
    </span>
  ),
};
