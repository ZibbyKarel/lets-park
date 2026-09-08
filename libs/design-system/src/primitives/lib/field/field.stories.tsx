import type { Meta, StoryObj } from '@storybook/react-vite';

import { Field, useFieldIds, type FieldOwnProps } from './field';

/**
 * `Field` takes its ids as a prop rather than deriving them, so that the
 * control it wraps and the text around it can never disagree about them. Every
 * caller therefore pairs it with `useFieldIds`; this host does the same, so the
 * stories draw the component the way `Input` and `Select` actually use it.
 */
function FieldHost({ label, hint, error }: FieldOwnProps) {
  const ids = useFieldIds(undefined, { hint, error });

  return (
    <Field ids={ids} label={label} hint={hint} error={error}>
      <input
        id={ids.controlId}
        aria-invalid={ids.invalid || undefined}
        aria-describedby={ids.describedBy}
        placeholder="Nestylovaný input"
        className="h-10 rounded-md border border-border bg-bg px-4 text-sm text-fg"
      />
    </Field>
  );
}

const meta: Meta<typeof FieldHost> = {
  title: 'Primitives/Field',
  component: FieldHost,
  args: { label: 'Jméno' },
  decorators: [
    (Story) => (
      <div className="max-w-96">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof FieldHost>;

/** Label only — the plain case, and the one `Input`/`Select` render most. */
export const LabelOnly: Story = {};

export const WithHint: Story = {
  args: { hint: 'Zobrazí se ostatním v přehledu.' },
};

/** The message *is* the error state: it also drives `aria-invalid`. */
export const WithError: Story = {
  args: { error: 'Vyplň prosím jméno.' },
};

/**
 * Both at once. Neither replaces the other — the hint keeps explaining the
 * field while the error says what is wrong with it, and `aria-describedby`
 * names both, hint first, in the order they are drawn.
 */
export const WithHintAndError: Story = {
  args: { hint: 'Zobrazí se ostatním v přehledu.', error: 'Vyplň prosím jméno.' },
};

/**
 * A hint with no label. Legal — `label` is optional — and the shape a control
 * that gets its name from `aria-label` elsewhere ends up in.
 */
export const HintWithoutLabel: Story = {
  args: { label: undefined, hint: 'Nepovinné pole.' },
};

/** The label is a `ReactNode`, not a `string`, so it can carry markup. */
export const RichLabel: Story = {
  args: {
    label: (
      <>
        Jméno <span className="text-danger">*</span>
      </>
    ),
  },
};
