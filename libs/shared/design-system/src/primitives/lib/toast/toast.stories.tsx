import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from '../button/button';
import { Toast, ToastRegion, type ToastTone } from './toast';

const TONES: ToastTone[] = ['neutral', 'info', 'success', 'warning', 'danger'];

const meta: Meta<typeof Toast> = {
  title: 'Primitives/Toast',
  component: Toast,
  args: { children: 'Změny byly uloženy.', tone: 'info' },
  argTypes: {
    tone: { control: 'inline-radio', options: TONES },
  },
};

export default meta;
type Story = StoryObj<typeof Toast>;

export const Default: Story = {};

export const Tones: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      {TONES.map((tone) => (
        <Toast key={tone} {...args} tone={tone}>
          {tone}
        </Toast>
      ))}
    </div>
  ),
};

/** `danger` is the one tone announced assertively (`role="alert"`). */
export const WithTitle: Story = {
  args: {
    title: 'Uložení selhalo',
    tone: 'danger',
    children: 'Zkus to prosím znovu za chvíli.',
  },
};

export const WithIcon: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Toast {...args} tone="success" icon="✓" title="Hotovo">
        Změny se projeví zítra.
      </Toast>
      <Toast {...args} tone="warning" icon="⊘" title="Zamčeno">
        Položka je dnes nedostupná.
      </Toast>
    </div>
  ),
};

export const Dismissible: Story = {
  args: { onDismiss: () => undefined, title: 'Uloženo' },
};

function InARegionDemo() {
  const [items, setItems] = useState<{ id: number; tone: ToastTone }[]>([]);
  const [nextId, setNextId] = useState(1);

  const push = (tone: ToastTone) => {
    setItems((current) => [...current, { id: nextId, tone }]);
    setNextId((current) => current + 1);
  };

  return (
    <div className="flex min-h-64 flex-col items-start gap-4">
      <div className="flex gap-3">
        <Button onClick={() => push('success')}>Přidat úspěch</Button>
        <Button variant="danger" onClick={() => push('danger')}>
          Přidat chybu
        </Button>
      </div>
      <p className="max-w-96 text-sm text-fg-3">
        Po kliknutí zůstane focus na tlačítku – oznámení se přečte, ale focus nekrade.
      </p>

      <ToastRegion label="Oznámení">
        {items.map((item) => (
          <Toast
            key={item.id}
            tone={item.tone}
            title={item.tone === 'danger' ? 'Chyba' : 'Hotovo'}
            onDismiss={() =>
              setItems((current) => current.filter((candidate) => candidate.id !== item.id))
            }
          >
            {item.tone === 'danger' ? 'Uložení selhalo.' : 'Změny uloženy.'}
          </Toast>
        ))}
      </ToastRegion>
    </div>
  );
}

/**
 * The real shape: a `ToastRegion` that is rendered unconditionally and empty,
 * with toasts pushed into it. Each `Toast` carries its own live region
 * (`role="status"`/`"alert"`); the region itself deliberately does not, so the
 * two cannot double-announce — and the toast never takes focus, so the button
 * below stays where the user left it.
 */
export const InARegion: Story = {
  render: () => <InARegionDemo />,
};

/** The three positions the region can sit in. */
export const RegionPlacements: Story = {
  render: () => (
    <div className="relative min-h-96 w-full rounded-lg border border-dashed border-border">
      <ToastRegion label="Vpravo nahoře" placement="top-right" className="absolute">
        <Toast tone="info">top-right</Toast>
      </ToastRegion>
      <ToastRegion label="Vpravo dole" placement="bottom-right" className="absolute">
        <Toast tone="success">bottom-right</Toast>
      </ToastRegion>
      <ToastRegion label="Dole uprostřed" placement="bottom-center" className="absolute">
        <Toast tone="warning">bottom-center</Toast>
      </ToastRegion>
    </div>
  ),
};
