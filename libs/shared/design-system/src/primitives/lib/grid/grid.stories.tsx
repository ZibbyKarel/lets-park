import type { Meta, StoryObj } from '@storybook/react-vite';

import type { ReactNode } from 'react';

import { Grid } from './grid';

function GridCell({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-bg-muted px-4 py-2 text-sm">{children}</div>
  );
}

const meta: Meta<typeof Grid> = {
  title: 'Primitives/Grid',
  component: Grid,
  args: { spacing: 6 },
};

export default meta;
type Story = StoryObj<typeof Grid>;

/** Fixed 3-column grid. */
export const FixedColumns: Story = {
  args: { columns: 3 },
  render: (args) => (
    <Grid {...args}>
      {Array.from({ length: 6 }, (_, i) => (
        <GridCell key={i}>Buňka {i + 1}</GridCell>
      ))}
    </Grid>
  ),
};

/** Responsive: 1 column on narrow viewports, 2 from `md` up — replacing `grid gap-6 md:grid-cols-2` (`admin-window-screen.tsx:106`). */
export const Responsive: Story = {
  args: { columns: { base: 1, md: 2 } },
  render: (args) => (
    <Grid {...args}>
      <GridCell>Sekce A</GridCell>
      <GridCell>Sekce B</GridCell>
    </Grid>
  ),
};
