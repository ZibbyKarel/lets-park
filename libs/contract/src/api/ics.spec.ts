import {
  ICS_FEED_BASE_PATH,
  ICS_FEED_FILE_EXTENSION,
  buildIcsFeedPath,
  buildIcsFeedUrl,
} from './ics';

describe('buildIcsFeedPath', () => {
  it('builds /api/calendar/<token>.ics', () => {
    expect(buildIcsFeedPath('s3cr3t-token')).toBe('/api/calendar/s3cr3t-token.ics');
  });

  it('is built from the exported constants, not a repeated literal', () => {
    const token = 'abc';
    expect(buildIcsFeedPath(token)).toBe(
      `${ICS_FEED_BASE_PATH}/${token}${ICS_FEED_FILE_EXTENSION}`
    );
  });

  it('includes the API global prefix', () => {
    // apps/api/src/main.ts calls app.setGlobalPrefix('api'); if that ever
    // changes, this constant has to change with it.
    expect(ICS_FEED_BASE_PATH.startsWith('/api/')).toBe(true);
  });

  it('percent-encodes the token', () => {
    expect(buildIcsFeedPath('a/b c')).toBe('/api/calendar/a%2Fb%20c.ics');
  });

  it('rejects an empty token instead of returning a collection URL', () => {
    expect(() => buildIcsFeedPath('')).toThrow(/must not be empty/);
  });
});

describe('buildIcsFeedUrl', () => {
  it('joins an origin with the feed path', () => {
    expect(buildIcsFeedUrl('https://parking.example.com', 'tok')).toBe(
      'https://parking.example.com/api/calendar/tok.ics'
    );
  });

  it('normalizes trailing slashes on the base URL', () => {
    expect(buildIcsFeedUrl('https://parking.example.com/', 'tok')).toBe(
      buildIcsFeedUrl('https://parking.example.com', 'tok')
    );
    expect(buildIcsFeedUrl('https://parking.example.com///', 'tok')).toBe(
      'https://parking.example.com/api/calendar/tok.ics'
    );
  });

  it('produces a URL a calendar client can parse', () => {
    const url = new URL(buildIcsFeedUrl('http://localhost:3000', 'tok'));
    expect(url.origin).toBe('http://localhost:3000');
    expect(url.pathname).toBe('/api/calendar/tok.ics');
  });

  it('rejects an empty base URL or an empty token', () => {
    expect(() => buildIcsFeedUrl('', 'tok')).toThrow(/must not be empty/);
    expect(() => buildIcsFeedUrl('https://example.com', '')).toThrow(/must not be empty/);
  });
});
