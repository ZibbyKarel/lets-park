import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  LOCALE_LABELS,
  isLocale,
  negotiateLocale,
} from './locale';

describe('locale vocabulary', () => {
  it('has exactly the two locales the product ships, Czech first', () => {
    expect(LOCALES).toEqual(['cs', 'en']);
    expect(DEFAULT_LOCALE).toBe('cs');
    expect(LOCALE_COOKIE).toBe('NEXT_LOCALE');
  });

  it('labels each locale in its own language', () => {
    expect(LOCALE_LABELS).toEqual({ cs: 'Čeština', en: 'English' });
  });

  it('recognises only the shipped locales', () => {
    expect(isLocale('cs')).toBe(true);
    expect(isLocale('en')).toBe(true);
    expect(isLocale('sk')).toBe(false);
    expect(isLocale('CS')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});

describe('negotiateLocale', () => {
  it('prefers a valid cookie over the header', () => {
    expect(negotiateLocale({ cookie: 'en', acceptLanguage: 'cs-CZ' })).toBe('en');
    expect(negotiateLocale({ cookie: 'cs', acceptLanguage: 'en-GB' })).toBe('cs');
  });

  it('ignores a cookie that is not a shipped locale', () => {
    expect(negotiateLocale({ cookie: 'de', acceptLanguage: 'en-GB' })).toBe('en');
    expect(negotiateLocale({ cookie: '', acceptLanguage: 'en-GB' })).toBe('en');
  });

  it('maps Czech and Slovak browsers to Czech', () => {
    expect(negotiateLocale({ acceptLanguage: 'cs' })).toBe('cs');
    expect(negotiateLocale({ acceptLanguage: 'cs-CZ,cs;q=0.9,en;q=0.8' })).toBe('cs');
    expect(negotiateLocale({ acceptLanguage: 'sk-SK,sk;q=0.9,en;q=0.8' })).toBe('cs');
    expect(negotiateLocale({ acceptLanguage: 'SK' })).toBe('cs');
  });

  it('maps every other browser language to English', () => {
    expect(negotiateLocale({ acceptLanguage: 'en-US,en;q=0.9' })).toBe('en');
    expect(negotiateLocale({ acceptLanguage: 'de-DE,de;q=0.9' })).toBe('en');
    expect(negotiateLocale({ acceptLanguage: 'pl' })).toBe('en');
  });

  it('honours quality values rather than raw order', () => {
    expect(negotiateLocale({ acceptLanguage: 'en;q=0.4,sk;q=0.9' })).toBe('cs');
    expect(negotiateLocale({ acceptLanguage: 'cs;q=0.2,de;q=0.8' })).toBe('en');
  });

  it('falls back to Czech when there is nothing to go on', () => {
    expect(negotiateLocale({})).toBe('cs');
    expect(negotiateLocale({ cookie: null, acceptLanguage: null })).toBe('cs');
    expect(negotiateLocale({ acceptLanguage: '' })).toBe('cs');
    expect(negotiateLocale({ acceptLanguage: '*' })).toBe('cs');
  });
});
