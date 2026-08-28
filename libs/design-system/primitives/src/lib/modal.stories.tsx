import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';

import { Button } from './button';
import { Input } from './input';
import { Modal, type ModalProps } from './modal';
import { Select } from './select';

const meta: Meta<typeof Modal> = {
  title: 'Primitives/Modal',
  component: Modal,
  args: {
    title: 'Nastavení',
    description: 'Popis, který dialog vysvětluje jednou větou.',
    size: 'sm',
  },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'md'] },
  },
};

export default meta;
type Story = StoryObj<typeof Modal>;

/**
 * Every story opens the modal from a real trigger rather than rendering it
 * already open: the focus trap and the return of focus on close are the whole
 * point of this component, and neither is visible without something to return
 * focus *to*.
 */
function Demo({ children, ...args }: Omit<ModalProps, 'open' | 'onClose'>) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col items-start gap-4">
      <Button onClick={() => setOpen(true)}>Otevřít dialog</Button>
      <p className="max-w-96 text-sm text-fg-3">
        Po otevření zkus Tab a Shift+Tab – focus zůstane uvnitř. Escape nebo klik na pozadí dialog
        zavře a focus se vrátí na tlačítko.
      </p>
      <Modal {...args} open={open} onClose={() => setOpen(false)}>
        {children}
      </Modal>
    </div>
  );
}

export const Default: Story = {
  render: (args) => (
    <Demo
      {...args}
      footer={
        <>
          <Button variant="secondary">Zrušit</Button>
          <Button>Uložit</Button>
        </>
      }
    >
      <Input label="Kód" defaultValue="ABC 123" />
    </Demo>
  ),
};

/** Form dialog — the shape the design draws most often. */
export const WithForm: Story = {
  render: (args) => (
    <Demo
      {...args}
      title="Úprava položky"
      description="Hodnoty se předvyplní z nastavení."
      footer={
        <>
          <Button variant="secondary">Zavřít</Button>
          <Button>Potvrdit</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Input label="Jméno" defaultValue="Karel Zíbar" />
        <Input label="Kód" defaultValue="ABC 123" />
        <Select label="Kategorie">
          <option value="1">První</option>
          <option value="2">Druhá</option>
        </Select>
      </div>
    </Demo>
  ),
};

/** The eyebrow pill above the title, for a status the dialog is about. */
export const WithEyebrow: Story = {
  render: (args) => (
    <Demo
      {...args}
      eyebrow="Obsazeno"
      title="Položka B12"
      description="Nikdo nečeká — budeš první v řadě."
      footer={<Button>Potvrdit</Button>}
    />
  ),
};

/** Wide step, for content that needs two columns or a table. */
export const WideSize: Story = {
  render: (args) => (
    <Demo
      {...args}
      size="md"
      title="Hromadná akce"
      description="Širší krok (--modal-w-md) pro obsah, na který úzký dialog nestačí."
      footer={<Button>Potvrdit</Button>}
    >
      <div className="grid grid-cols-2 gap-4">
        <Input label="Od" type="date" />
        <Input label="Do" type="date" />
      </div>
    </Demo>
  ),
};

/**
 * A dialog with unsaved input should not throw the work away on a stray click,
 * so the scrim stops closing it. Escape and the × button still work.
 */
export const ScrimDoesNotClose: Story = {
  render: (args) => (
    <Demo
      {...args}
      closeOnScrimClick={false}
      title="Rozepsaná změna"
      description="Klik na pozadí dialog nezavře. Escape a × ano."
      footer={<Button>Uložit</Button>}
    >
      <Input label="Poznámka" defaultValue="Rozepsaný text" />
    </Demo>
  ),
};

/**
 * Without the × button and with nothing focusable inside, the dialog focuses
 * itself — the screen reader must not stay in the page behind it.
 */
export const NoControlsInside: Story = {
  render: (args) => (
    <Demo
      {...args}
      hideCloseButton
      title="Jen zpráva"
      description="Dialog bez jediného ovládacího prvku. Zavírá se Escapem nebo klikem na pozadí."
    />
  ),
};
