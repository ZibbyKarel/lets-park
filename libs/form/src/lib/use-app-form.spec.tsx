/**
 * Unit-level coverage of `useAppForm` + `FormField` on their own, with a bare
 * `<input>` rather than a design-system primitive — the design-system
 * integration (and the "no direct react-hook-form import" proof) lives in
 * `app-form.spec.tsx`. This file exists so the wrapper's own plumbing is
 * covered independently of that heavier demo.
 */
import * as z from 'zod';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormField, FormProvider, useAppForm } from '@lets-park/form';

const emailSchema = z.object({
  email: z.email('Enter a valid email'),
});

type EmailValues = z.infer<typeof emailSchema>;

function EmailForm({ onValid }: { readonly onValid: (values: EmailValues) => void }) {
  const form = useAppForm({ schema: emailSchema, defaultValues: { email: '' } });

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit(onValid)}>
        <FormField
          name="email"
          render={({ field, error }) => (
            <div>
              <label htmlFor="email-field">Email</label>
              <input id="email-field" aria-invalid={error ? true : undefined} {...field} />
              {error ? <p role="alert">{error}</p> : null}
            </div>
          )}
        />
        <button type="submit">Submit</button>
      </form>
    </FormProvider>
  );
}

describe('useAppForm + FormField', () => {
  it('reflects the Zod validation message into the field, observably', async () => {
    const user = userEvent.setup();
    render(<EmailForm onValid={jest.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid email');
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('calls the submit handler with the schema-parsed values once valid', async () => {
    const user = userEvent.setup();
    const onValid = jest.fn();
    render(<EmailForm onValid={onValid} />);

    await user.type(screen.getByLabelText('Email'), 'person@example.com');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onValid).toHaveBeenCalledTimes(1);
    expect(onValid).toHaveBeenCalledWith({ email: 'person@example.com' }, expect.anything());
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
