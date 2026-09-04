import { toIcsFeedView } from './settings-view';

describe('toIcsFeedView', () => {
  it('builds the feed URL from an origin and a token', () => {
    expect(toIcsFeedView('https://api.test', 'ics-token-abc')).toEqual({
      kind: 'ready',
      url: 'https://api.test/api/calendar/ics-token-abc.ics',
    });
  });

  it('is unavailable when the API origin could not be derived', () => {
    // An empty origin is what `apiOriginOf` returns when it has nothing to
    // work with; building a link from it would produce a broken one.
    expect(toIcsFeedView('', 'ics-token-abc')).toEqual({ kind: 'unavailable' });
  });

  it('is unavailable before the profile has brought a token', () => {
    expect(toIcsFeedView('https://api.test', undefined)).toEqual({ kind: 'unavailable' });
  });
});
