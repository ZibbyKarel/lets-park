import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Tabs, type TabItem, type TabsProps } from './tabs';

const ITEMS: TabItem[] = [
  { id: 'users', label: 'Uživatelé', content: <Panel>Tabulka uživatelů</Panel> },
  { id: 'reports', label: 'Sestavy', content: <Panel>Seznam sestav</Panel> },
  { id: 'rules', label: 'Pravidla', content: <Panel>Nastavení pravidel</Panel> },
];

function Panel({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg p-6 text-sm text-fg-2">{children}</div>
  );
}

const meta: Meta<typeof Tabs> = {
  title: 'Primitives/Tabs',
  component: Tabs,
  args: { items: ITEMS, label: 'Administrace' },
  decorators: [
    (Story) => (
      <div className="w-full max-w-[var(--modal-w-md)]">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof Tabs>;

/**
 * Keyboard: Left/Right move focus *and* the selection (automatic activation),
 * Home/End jump to the ends, and Tab from the strip goes into the panel — the
 * whole strip is one stop in the page's tab order.
 */
export const Default: Story = {};

/** Opened on a tab other than the first. */
export const DefaultValue: Story = {
  args: { defaultValue: 'rules' },
};

/** A disabled tab is skipped by the arrow keys and cannot be clicked. */
export const WithDisabledTab: Story = {
  args: {
    items: [
      { id: 'users', label: 'Uživatelé', content: <Panel>Tabulka uživatelů</Panel> },
      { id: 'reports', label: 'Sestavy', content: <Panel>Seznam sestav</Panel>, disabled: true },
      { id: 'rules', label: 'Pravidla', content: <Panel>Nastavení pravidel</Panel> },
    ],
  },
};

/** Enough tabs to overflow, which scrolls the strip horizontally. */
export const Overflowing: Story = {
  args: {
    items: Array.from({ length: 9 }, (_, index) => ({
      id: `tab-${index}`,
      label: `Dlouhý název ${index + 1}`,
      content: <Panel>{`Obsah ${index + 1}`}</Panel>,
    })),
  },
  decorators: [
    (Story) => (
      <div className="w-full max-w-96">
        <Story />
      </div>
    ),
  ],
};

function ControlledDemo(args: TabsProps) {
  const [value, setValue] = useState('reports');

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-fg-3">
        Vybráno: <span className="font-bold text-fg">{value}</span>
      </p>
      <Tabs {...args} value={value} onValueChange={setValue} />
    </div>
  );
}

/** Selection owned by the parent, which is how a router-driven strip works. */
export const Controlled: Story = {
  render: (args) => <ControlledDemo {...args} />,
};
