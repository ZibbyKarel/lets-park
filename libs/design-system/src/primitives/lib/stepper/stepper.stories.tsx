import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Stepper } from './stepper';

const meta: Meta<typeof Stepper> = {
  title: 'Primitives/Stepper',
  component: Stepper,
  args: { label: 'Počet', min: 1, max: 31, defaultValue: 7 },
};

export default meta;
type Story = StoryObj<typeof Stepper>;

export const Default: Story = {};

/** `formatValue` also becomes `aria-valuetext`, so the unit is read aloud. */
export const WithUnit: Story = {
  args: {
    label: 'Počet dní',
    formatValue: (value: number) => {
      if (value === 1) {
        return `${value} den`;
      }

      return value < 5 ? `${value} dny` : `${value} dní`;
    },
  },
};

/** At the boundary the corresponding button goes disabled. */
export const AtMinimum: Story = {
  args: { defaultValue: 1 },
};

export const AtMaximum: Story = {
  args: { defaultValue: 31 },
};

export const Disabled: Story = {
  args: { disabled: true },
};

function KeyboardDemo() {
  const [value, setValue] = useState(3);

  return (
    <div className="flex flex-col gap-3">
      <Stepper label="Počet" min={0} max={10} value={value} onValueChange={setValue} />
      <p className="text-sm text-fg-3">Hodnota: {value}</p>
    </div>
  );
}

/**
 * The value is a `spinbutton`: Tab onto it, then šipky, Home nebo End.
 */
export const KeyboardOperation: Story = {
  render: () => <KeyboardDemo />,
};

export const CustomStep: Story = {
  args: { min: 0, max: 100, step: 5, defaultValue: 20 },
};
