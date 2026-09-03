# 0162 – The user search filters the loaded list, it does not refetch

## What

The search box in the "Uživatelé" tab filters the array the screen already
holds. `AdminUsersPanel` calls `admin.user.list` **once**, with an empty input —
no `role`, no `active`, no `search` — and `matchesUserSearch` in
`admin-users-screen.tsx` does the filtering in the browser.

The contract's `search` parameter is left unused, not removed.

## Why

- **The list is small and complete.** The design's own mock says "6 účtů ze
  SSO"; the population is one company's employees, provisioned by Okta. The
  whole table is one response and it is already in memory.
- **Server-side search would be a request per keystroke.** TanStack Query keys
  on the input, so `{ search: 'n' }`, `{ search: 'no' }`, `{ search: 'nov' }`
  are three distinct queries and three distinct requests. Making that acceptable
  needs a debounce; this workspace has no debounce utility, and adding one for
  a table of six rows is a worse trade than filtering locally.
- **Local filtering is instant, and does not flicker.** A refetch-per-keystroke
  table either goes blank between responses or needs `placeholderData:
  keepPreviousData`, which `libs/query` does not re-export.
- **The unused parameter is not dead weight.** `admin.user.list` is a contract
  procedure, not this screen's private endpoint; a different consumer (a script,
  a future screen over a much larger list) can use `search`, `role` and
  `active`, and `UsersService.adminList` implements all three with tests.

## How

- `matchesUserSearch(user, term)` is exported and tested on its own: a
  case-insensitive substring against `name` **or** `email`, with an empty or
  whitespace-only term matching everything.
- That rule is deliberately the same one `UsersService.adminList` applies to its
  `search` input (`contains`, `mode: 'insensitive'`, over `name` and `email`).
  Two implementations of "what a search means" that disagree would be worse than
  either one alone.
- The card's description keeps the **total** (`all.length`), not the filtered
  count, so "3 účty ze SSO" does not change as you type — the sentence is about
  the company, not about the current filter.
- An empty result says `usersEmptySearch` ("Hledání nic nenašlo") rather than
  `usersEmpty` ("Žádní uživatelé"): a table emptied by a filter and a table with
  nothing in it are different situations and must not share a sentence.

## Risk

- **The two implementations can drift.** If `UsersService.adminList`'s matching
  is ever changed — to prefix-only, or to a trigram index — this screen keeps
  the old behaviour silently, because it never calls that code. The mitigation
  is that both are written down: the service's docstring says what it does, and
  `matchesUserSearch`'s says it mirrors it.
- **It does not scale.** At a few thousand users the initial response, not the
  filtering, becomes the problem. The fix then is paging, which needs a contract
  change (`admin.user.list` returns an unbounded array today) — at which point
  moving the search server-side comes with it. Deliberately not pre-built.
- **Czech diacritics are not folded.** Typing `horakova` does not match
  "Horáková". Neither does the backend's `contains`, so the two agree; changing
  it would be a change to both.
