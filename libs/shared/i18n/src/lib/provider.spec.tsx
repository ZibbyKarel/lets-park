import { render, screen } from '@testing-library/react';
import { IntlProvider } from './provider';
import { useTranslations, useLocale } from 'next-intl';

const messages = { shell: { brand: "Let's Park" } };

function Probe() {
  const t = useTranslations('shell');
  return (
    <>
      <span data-testid="copy">{t('brand')}</span>
      <span data-testid="locale">{useLocale()}</span>
    </>
  );
}

it('serves the messages it was given under the locale it was given', () => {
  render(
    <IntlProvider locale="cs" messages={messages}>
      <Probe />
    </IntlProvider>
  );

  expect(screen.getByTestId('copy')).toHaveTextContent("Let's Park");
  expect(screen.getByTestId('locale')).toHaveTextContent('cs');
});

it('carries a different locale through without touching the messages', () => {
  render(
    <IntlProvider locale="en" messages={{ shell: { brand: "Let's Park" } }}>
      <Probe />
    </IntlProvider>
  );

  expect(screen.getByTestId('locale')).toHaveTextContent('en');
  expect(screen.getByTestId('copy')).toHaveTextContent("Let's Park");
});
