# 0011 – Odvozené control tokeny a zaokrouhlení rozměrů z designu

## Co

Vznikl nový, **záměrně oddělený** modul tokenů
`libs/design-system/tokens/src/lib/controls.ts` s vlastní skupinou CSS
proměnných:

- `--control-h-sm|md|lg|xl` = `36px | 40px | 48px | 56px` – sdílená výšková
  škála pro Button, Input, Select a Stepper,
- `--switch-w|h|pad|knob|knob-shadow` – geometrie přepínače (46×26, knoflík 20px).

Zároveň platí pravidlo **zaokrouhlování**: rozměry a velikosti písma z designu,
které nesedí na existující škálu, se snapují na nejbližší token, ne kopírují
doslova.

| v designu | v primitivu | token |
| --- | --- | --- |
| výšky 32 / 44 / 52 px | 36 / 40 / 48 px | `--control-h-*` |
| `font-size` 13 / 15 / 17 px | 14 / 16 / 18 px | `--fs-sm` / `--fs-base` / `--fs-md` |
| padding 14 / 18 / 22 / 26 / 34 px | 12 / 16 / 20 / 24 / 32 px | `--space-3..8` |
| avatar 22 / 30 / 34 px | 24 / 32 / 40 px | `--space-6/8/10` |
| badge výška 24 i 26 px | 24 px | `--space-6` |
| stepper tlačítko 44×48 | 48×48 | `--control-h-lg` |

## Proč

Global constraint 5 zakazuje ručně psané hodnoty barev a spacingu mimo vrstvu
tokenů. Design (`doc/design/lets-park-design.dc.html`) je ale psaný inline styly
a používá **sedm různých výšek** tlačítek a pět velikostí písma, z nichž velká
část na `--space-*` ani `--fs-*` škálu nesedí (36, 44, 52, 56 px; 13, 15, 17 px).

Byly tři možnosti:

1. Napsat hodnoty natvrdo do primitivů → porušení constraintu 5.
2. Vynechat je a použít jen to, co na škále je → primitivy by se viditelně
   rozešly s designem (chybělo by hero CTA 56 px i kompaktní řádek 36 px).
3. Doplnit chybějící kategorii do vrstvy tokenů a zbytek zaokrouhlit.

Zvolena je 3. Výšku interaktivního prvku je navíc rozumné mít jako **vlastní
sémantickou kategorii** – není to spacing ani radius, je to rozměr ovládacího
prvku, a design systém ji potřebuje sdílet mezi čtyřmi komponentami.

Zaokrouhlení řeší druhou půlku problému: kdyby se do tokenů dostala každá
hodnota z designu, vznikla by škála o sedmi krocích, kterou nikdo neudrží
konzistentní. Rozdíl 1–4 px je vizuálně nepostřehnutelný, roztříštěná škála se
pozná okamžitě.

## Jak

- `controls.ts` má v hlavičce **výslovně napsáno, že je DERIVED**, ne 1:1 kopie
  `colors_and_type.css` – stejným způsobem, jakým je označený `BREAKPOINTS`
  v `layout.ts` (viz `doc/decision/0009-breakpointy-jsou-odvozene.md`).
  Ostatní moduly tokenů (`colors.ts`, `shadows.ts`, `spacing.ts`) zůstávají
  bajt za bajtem věrné zdroji – proto je i stín knoflíku přepínače
  (`0 1px 2px rgba(35,34,31,0.24)`, tmavší než kterýkoli `--shadow-*`)
  v `controls.ts` a ne v `shadows.ts`.
- Do `generateTokensCss` přibyla sekce `/* --- Controls --- */`,
  `assets/tokens.css` je přegenerovaný, drift test prošel.
- Do `assets/theme.css` se `--control-*` **nemapují**. Tailwind v4 nemá
  namespace pro výšku (výšky bere ze `--spacing-*`) a protlačit je přes
  `--spacing-*` by vyrobilo nesmyslné utility `w-control-lg` / `p-control-lg`.
  Primitivy je konzumují jako arbitrary value: `h-[var(--control-h-lg)]`.
- Mapování krok → padding → velikost písma je na jednom místě
  (`libs/design-system/primitives/src/lib/control-size.ts`), aby se čtyři
  komponenty nemohly rozejít.

## Riziko

- **Odchylka od designu.** Tlačítka v modálech jsou 48 px místo návrhových 48 px
  (sedí), ale např. „Přidat místo" bude 40 nebo 48 místo 44. Rozdíl je do 4 px.
  Kdyby si to vizuální review vyžádalo, přidat pátý krok je jeden řádek
  v `controls.ts` + přegenerování CSS.
- **Dvojí povaha tokenů.** V jedné libce jsou teď dvě skupiny tokenů s různým
  zdrojem pravdy (`colors_and_type.css` vs. exportovaný design). Kdo bude
  příště přidávat token, musí vědět, do které skupiny patří – proto to má
  `controls.ts` napsané v hlavičce a `doc/design-system.md` v sekci
  „Jak přidat nový token".
- **Zaokrouhlení je jednosměrné.** Až přijde aktualizovaný design, nepůjde
  automaticky poznat, jestli je rozdíl 4 px záměrné zaokrouhlení, nebo nová
  hodnota. Tabulka výše je proto součástí tohoto rozhodnutí.
