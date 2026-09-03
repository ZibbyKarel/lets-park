import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GlobalError from './global-error';

/**
 * The Czech-UI rule at the one moment nothing else is working.
 *
 * A throw from `RootLayout` — `await auth()` on a cookie encrypted with a
 * rotated `AUTH_SECRET` is the realistic one — is caught by nothing but
 * `global-error`, because it happens above `error.tsx`'s boundary. Without
 * this file the visitor gets Next.js's built-in English page.
 *
 * The file renders its own `<html>`/`<body>`, which is what makes it a
 * replacement for the root layout rather than a screen inside it. React warns
 * about the nesting when it is mounted inside jsdom's existing document; the
 * warning is an artefact of the harness, not of the component, and the
 * assertions below are about what the visitor reads either way.
 */

const originalError = console.error;

beforeAll(() => {
  console.error = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.includes('<html>')) return;
    originalError(...args);
  };
});

afterAll(() => {
  console.error = originalError;
});

function boom() {
  return Object.assign(new Error('JWEDecryptionFailed: decryption operation failed'), {
    digest: '1234567890',
  });
}

describe('global-error', () => {
  it('speaks Czech, from the catalogue, with no provider above it', () => {
    render(<GlobalError error={boom()} reset={jest.fn()} />);

    // Both strings are `shell.errorTitle` / `shell.errorUnknown` in
    // `libs/i18n`. Finding them proves the one provider this screen can
    // re-establish — `IntlProvider`, which carries its own messages — really is
    // re-established, rather than the file having hard-coded the sentences.
    expect(screen.getByText('Něco se nepovedlo')).toBeInTheDocument();
    expect(screen.getByText('Zkuste to prosím znovu za chvíli.')).toBeInTheDocument();
  });

  it('never puts the error, its message or its digest on the page', () => {
    render(<GlobalError error={boom()} reset={jest.fn()} />);

    expect(document.body.textContent).not.toContain('JWEDecryptionFailed');
    expect(document.body.textContent).not.toContain('decryption operation failed');
    expect(document.body.textContent).not.toContain('1234567890');
  });

  it('offers the retry, wired to Next.js’s own reset', async () => {
    const reset = jest.fn();
    render(<GlobalError error={boom()} reset={reset} />);

    await userEvent.click(screen.getByRole('button', { name: 'Zkusit znovu' }));

    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('declares the document language, because it replaces the root layout', () => {
    // React 19 renders `<html>`/`<body>` by applying them to the document's
    // existing nodes rather than nesting new ones, so the attribute lands on
    // `document.documentElement` — which is exactly where it has to be in the
    // browser for a screen reader to read the page as Czech.
    render(<GlobalError error={boom()} reset={jest.fn()} />);

    expect(document.documentElement).toHaveAttribute('lang', 'cs');
  });
});
