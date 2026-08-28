import { render, screen } from '@testing-library/react';
import { useTranslations } from 'next-intl';
import { IntlProvider } from './provider';

/** A minimal consumer exercising next-intl's own hook, as feature code would. */
function ErrorMessage({ code }: { readonly code: 'CONFLICT' }) {
  const t = useTranslations('errors');
  return <p>{t(code)}</p>;
}

describe('IntlProvider', () => {
  it('wires up the fixed Czech locale, Europe/Prague time zone and message catalog', () => {
    render(
      <IntlProvider>
        <ErrorMessage code="CONFLICT" />
      </IntlProvider>
    );

    expect(
      screen.getByText('Někdo jiný mezitím provedl stejnou změnu — zkuste to prosím znovu.')
    ).toBeInTheDocument();
  });
});
