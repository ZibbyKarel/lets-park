# 0002 – Vizuální design: staženo lokálně, tokeny z Shoptet DS

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

Design z Claude Design odkazu v `plan.md` byl otevřen a **kompletně stažen** do
`doc/design/` (zdrojové `.dc.html`, `ds/colors_and_type.css`, fonty, 16 screenshotů).
`libs/design-system/tokens` se odvozuje **z `doc/design/ds/colors_and_type.css`**, ne
z fallback popisu v `plan.md`.

## Proč

- `plan.md` říká: pokus se design otevřít; jen když ho nemáš vůbec, použij textový fallback.
  Design je dostupný, takže fallback neplatí.
- `WebFetch` na odkaz vrací 403 (Cloudflare), ale **Playwright s přihlášenou claude.ai
  session ho otevře**. 403 z WebFetch tedy není důkaz nedostupnosti.
- Fallback popis v `plan.md` uvádí akcenty `#fcaf00 / #00e25a / #3b88ff`. Skutečný design
  stojí na Shoptet DS paletě s primární `#008FFF`. Kdybychom šli podle fallbacku, celý
  design systém by měl špatné barvy.

## Jak

- Stažení: Playwright `page.request.get` na `…claudeusercontent.com/…/serve/…` (cookie
  `__Host-omelette-preview` drží session) → POST na lokální node „sink" server, který
  zapíše soubor na disk. Kontext modelu tím neprojde 86 kB HTML.
- Subagenti pro Fáze 2/3/6 dostávají v briefu absolutní cesty do `doc/design/`.
- Fonty `.otf` jsou uloženy pro věrnost; před produkcí ověřit licenci – tokeny musí mít
  funkční fallback stack.

## Riziko, když je to špatně

Kdyby `colors_and_type.css` nebyl aktuální verzí firemního DS, tokeny by bylo nutné
přegenerovat – změna je lokalizovaná do jedné lib (`libs/design-system/tokens`), protože
všechno ostatní čte jen tokeny, ne hodnoty.
