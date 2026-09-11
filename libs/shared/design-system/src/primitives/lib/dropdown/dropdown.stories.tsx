import type { Meta, StoryObj } from '@storybook/react-vite';

import { Avatar } from '../avatar/avatar';
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

/**
 * Identity header above the items, with dividers grouping the actions —
 * the shape the design's avatar menu actually uses: header, divider,
 * settings/admin, divider, sign-out.
 */
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
    items: [
      { id: 'sep-1', separator: true },
      { id: 'settings', label: 'Nastavení' },
      { id: 'admin', label: 'Správa', trailing: '→' },
      { id: 'sep-2', separator: true },
      { id: 'signout', label: 'Odhlásit se', danger: true },
    ],
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

/**
 * `checked` turns an item into a one-of-N choice: `role="menuitemradio"` with
 * `aria-checked`, so a screen reader announces which one is active. Items
 * without `checked` stay plain `menuitem`s and can sit in the same menu.
 */
export const WithCheckedItem: Story = {
  args: {
    trigger: <span className="px-2 font-medium">Jazyk ▾</span>,
    label: 'Jazyk',
    items: [
      { id: 'header', label: 'Jazyk', disabled: true },
      { id: 'cs', label: 'Čeština', checked: true },
      { id: 'en', label: 'English', checked: false },
    ],
  },
};
