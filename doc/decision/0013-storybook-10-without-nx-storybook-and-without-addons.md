# 0013 – Storybook 10 konfigurovaný ručně, bez `@nx/storybook` a bez addonů

## Co

Storybook 10 pro `libs/design-system/primitives` je nastavený **ručně**:

- `.storybook/main.ts` – `@storybook/react-vite`, `viteFinal` přidává
  `@tailwindcss/vite`, `addons: []`,
- `.storybook/preview.css` – importuje `theme.css` z libky tokenů a přidává
  `@source '../src'`,
- Nx cíle `storybook` a `build-storybook` jsou obyčejné `nx:run-commands`
  volající `storybook dev` / `storybook build`.

Do repa **nepřibyl** `@nx/storybook` ani žádný addon (včetně
`@storybook/addon-a11y` a testovacích addonů).

## Proč

**Bez `@nx/storybook`.** Jediné, co by přinesl, jsou executory pro dva cíle,
které umí `nx:run-commands` na jeden řádek. Naproti tomu by přidal závislost,
jejíž podpora Storybooku 10 se musí ověřovat při každém upgradu – generátor
laděný na starší major umí vygenerovat konfiguraci ve tvaru, který už neplatí.
Ruční konfigurace je patnáct řádků a čte se přímo proti oficiální dokumentaci
(global constraint 10: API těchhle knihoven se neopisuje z hlavy).

**Bez addonů.** Laťka pro přístupnost je v tomhle úkolu **funkční**: každá
komponenta má Jest + Testing Library test na `role`, přístupné jméno, fokus a
klávesnici. Ty běží v `npm run test` a shodí CI. `addon-a11y` je proti tomu
panel, do kterého se někdo musí podívat – nic nevynucuje. Testovací addony
(vitest addon / test-runner) by navíc do repa přitáhly druhý test runner vedle
Jestu, což `plan.md` nechce.

**Proč `theme.css`, a ne `tokens.css`.** Zadání úkolu říká „import `tokens.css`
v `preview.ts`". Importuje se ale `theme.css`, protože **to je dokumentovaný
vstupní bod pro konzumenty** (viz `doc/design-system.md`) a sám `tokens.css`
importuje. Kdyby Storybook natáhl jen `tokens.css`, měl by CSS proměnné, ale
žádné Tailwind utility, kterými je utratit – komponenty by byly nenastylované.

## Jak

- `viteFinal` **přidává** plugin do existujícího pole (`[...(plugins ?? []),
  tailwindcss()]`), nepřepisuje ho – jinak by zmizely pluginy, které si
  Storybook nastavil sám.
- Tailwind v4 hledá zdrojové soubory od adresáře toho CSS souboru, ve kterém je
  `@import "tailwindcss"`. Ten je v libce tokenů, takže by primitivy nikdo
  neskenoval – proto explicitní `@source '../src'` v `preview.css`.
- Ověřeno empiricky, ne odhadem: statický build (`nx run
  design-system-primitives:build-storybook`) projde a ve výsledném CSS jsou
  přítomné jak proměnné (`--control-h-md`, `--switch-knob-shadow`), tak
  utility včetně arbitrary values (`.h-\[var\(--control-h-lg\)\]`),
  variant (`.hover\:shadow-blue`, `.peer-indeterminate\:opacity-100`,
  `.active\:not-disabled\:scale-\[0\.97\]`) a `@font-face` bloků.
- `tsconfig.storybook.json` pokrývá `.storybook/**` a `*.stories.tsx`, aby se
  konfigurace i stories typovaly – `tsconfig.lib.json` je naopak vyřazuje, aby
  se stories nedostaly do veřejného API libky.

## Riziko

- **Ruční konfigurace zestárne.** Při upgradu Storybooku ji nikdo
  nemigruje automaticky. Je ale malá a `build-storybook` v CI okamžitě spadne.
- **Chybí a11y panel.** Automatická kontrola kontrastu a ARIA v prohlížeči se
  nedělá. Až budou v Fázi 7 e2e testy, patří axe kontrola spíš tam (běží proti
  reálné aplikaci, ne proti izolovaným stories). Do té doby to drží unit testy
  a `eslint-plugin-jsx-a11y`, který je v lint configu zapnutý.
- **`storybook build` není v `npm run build`.** Je to samostatný cíl, takže
  `npm run build` ho nespustí; do CI se musí přidat explicitně (`nx run-many -t
  build-storybook`), jinak by se rozbité stories poznaly až ručně.
