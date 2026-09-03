# 0265 – Two below-AA colour pairings the design owns are pinned, not fixed

**This record exists to reach a designer.** It is the only open item from the
design system's contrast pass, and nothing in the code can close it.

## What

Two colour pairings in `libs/design-system` measure below the WCAG 2.1 AA
threshold for normal-size text (4.5:1) and have been left exactly as they are:

| pairing | where it reaches a user | measured |
| --- | --- | --- |
| `--fg-on-blue` #FFFFFF on `--brand-blue` #008FFF | the primary CTA (`button.tsx`, `primary`), and the `info` toast's glyph chip | **3.30:1** |
| `--danger` #E5484D against `--bg` #FFFFFF, either way round | every form error message (`field.tsx`, `checkbox.tsx`, `radio.tsx`, 12px), the `danger` toast's glyph chip, the `danger` button's hover, and a `Dropdown`'s destructive item at rest | **3.91:1** |

One follow-on the designer should see with the second row: a `Dropdown` item
marked `danger` is `--danger` on `--bg` at rest (3.91:1) and `--danger` on
`--danger-100` on hover — **3.26:1**, so it gets *less* readable as the pointer
lands on it. That hover was left alone rather than turned neutral, because a
destructive menu item that stops being red on hover reads as a different
control; it is the resting pairing above that decides it.

Both are pinned by `libs/design-system/primitives/src/lib/contrast.spec.tsx`
(`KNOWN_EXEMPTIONS`), which asserts each still measures exactly the number above.
A token edit that changes either ratio fails that test and brings whoever made
it back here.

Every *other* below-AA pairing the final review found was fixed — see
`0266` and `0267`.

## Why

- **`plan.md` makes the finished visual design the source of truth**, and these
  two are the design's own choices, not the design system's. `--brand-blue` is
  the brand colour; `--fg-on-blue: var(--neutral-0)` is written into
  `doc/design/ds/colors_and_type.css:127`; `--danger: #E5484D` is written into
  the same file at `:140`. Changing them here would be this lib overruling the
  design on the two most-repeated surfaces in the product, silently, in a fix
  round. The four pairings that *were* changed are all cases where this lib
  picked which token goes on which — a decision the design never made.
- **The pinning is the point.** A skip would have made them invisible again.
  Keyed on the two hex values rather than on token names, because each pair is
  spelled several ways: the review found white-on-blue on the primary button,
  and the fix round's own probe then found the same pair on the `info` toast
  glyph, and red-against-white in three places rather than one.
- **This is a live AA failure, not a theoretical one.** The primary CTA appears
  on nearly every screen; the form error message is the single string a user
  most needs to be able to read. Neither is a corner case.

## How

**The decision that is being asked for.** Two questions, and the second is
nearly free:

1. **The primary CTA.** `--brand-blue-700` #0070D6 is already a token (it is
   the primary button's own hover colour). White on it measures **4.90:1** — it
   passes AA with room to spare, and it is a colour the design already uses on
   this exact control. Swapping `primary`'s resting background from
   `--brand-blue` to `--brand-blue-700` is a one-line change in
   `VARIANT_CLASSES` (`button.tsx`) and would make the button conformant. The
   cost is that the resting CTA becomes the darker blue and the hover would need
   a new step. *(The final review's report gives 4.72:1 for this pairing; 4.90:1
   is the recomputed value, asserted in `contrast.spec.tsx` so the number cannot
   be taken on trust.)*
2. **The error message.** #E5484D on white is 3.91:1 at 12px. Two ways out that
   do not touch the brand: draw error text at `--fs-sm` 14px **bold** (AA's
   large-text threshold is 3:1 for bold ≥14px, which 3.91:1 clears), or darken
   `--danger` for *text* only while keeping #E5484D for borders and fills. The
   first needs no new token.

Whoever rules on this: the ratios above are computed by
`contrast.spec.tsx`, so change the tokens and run
`npx nx run design-system-primitives:test` — the pinned values will tell you
immediately whether the new pairing conforms.

## Risk

- **Shipping a known AA failure.** That is what this record is: a decision to
  ship it visibly rather than to fix it invisibly. The alternative — one agent
  quietly restyling the brand's primary button during a fix round — is worse,
  but it is not obviously better than shipping conformant colours, which is
  exactly why this needs a human.
- **The pin can be defeated by deleting a row from `KNOWN_EXEMPTIONS`.** It is
  a signpost, not a lock. It is deliberately written so that removing a row
  makes the contrast test fail rather than pass.
- **jsdom draws nothing.** The ratios are computed from the token hexes, not
  sampled from a rendered pixel, so a pairing produced by opacity, a gradient or
  a `bg-scrim` overlay is outside what the test can see.
