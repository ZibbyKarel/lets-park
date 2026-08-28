import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar } from './avatar';
import { Dropdown, type DropdownItem } from './dropdown';

const ITEMS: DropdownItem[] = [
  { id: 'settings', label: 'Nastavení' },
  { id: 'admin', label: 'Správa', trailing: '→' },
  { id: 'signout', label: 'Odhlásit se', danger: true },
];

const meta: Meta<typeof Dropdown> = {
  title: 'Primitives/Dropdown',
  component: Dropdown,
  args: { items: ITEMS, align: 'end' },
  argTypes: {
    align: { control: 'inline-radio', options: ['start', 'end'] },
  },
  // The panel is absolutely positioned; without room below it, every story
  // would open off the bottom of the canvas.
  decorators: [
    (Story) => (
      <div className="flex min-h-80 justify-center pt-8">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Dropdown>;

/**
 * Keyboard: ArrowDown opens on the first item, ArrowUp on the last, arrows move
 * with wrapping, Home/End jump, Escape closes and returns focus to the trigger,
 * Tab leaves the widget entirely.
 */
export const Default: Story = {
  args: {
    trigger: (
      <>
        <Avatar initials="KZ" tone="dark" />
        <span className="font-medium">Karel Zíbar</span>
        <span className="text-xs text-fg-3">▾</span>
      </>
    ),
    triggerLabel: 'Uživatelské menu',
  },
};

/** Identity header above the items — present in the design's avatar menu. */
export const WithHeader: Story = {
  args: {
    trigger: (
      <>
        <Avatar initials="KZ" tone="dark" />
        <span className="font-medium">Karel Zíbar</span>
        <span className="text-xs text-fg-3">▾</span>
      </>
    ),
    triggerLabel: 'Uživatelské menu',
    header: (
      <div className="flex flex-col gap-1">
        <span className="text-sm font-bold text-fg">Karel Zíbar</span>
        <span className="text-xs text-fg-3">karel.zibar@firma.cz</span>
      </div>
    ),
  },
};

/** A plain text trigger, for a menu that is not about an identity. */
export const TextTrigger: Story = {
  args: {
    trigger: (
      <span className="px-2 font-medium">
        Akce <span className="text-xs text-fg-3">▾</span>
      </span>
    ),
    label: 'Akce',
  },
};

/** Disabled items are skipped by the arrow keys and cannot be selected. */
export const WithDisabledItem: Story = {
  args: {
    trigger: <span className="px-2 font-medium">Akce ▾</span>,
    label: 'Akce',
    items: [
      { id: 'edit', label: 'Upravit' },
      { id: 'duplicate', label: 'Duplikovat', disabled: true },
      { id: 'delete', label: 'Smazat', danger: true },
    ],
  },
};

/** Aligned to the left edge of the trigger instead of the right. */
export const AlignStart: Story = {
  args: {
    trigger: <span className="px-2 font-medium">Akce ▾</span>,
    label: 'Akce',
    align: 'start',
  },
};
