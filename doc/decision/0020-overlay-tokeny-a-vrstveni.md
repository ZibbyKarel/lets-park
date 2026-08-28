# 0020 – Overlay tokeny a jedna škála vrstvení

## Co

Nový modul tokenů `libs/design-system/tokens/src/lib/overlays.ts` a z něj
generovaná sekce v `tokens.css`:

| token | hodnota | původ |
| --- | --- | --- |
| `--z-sticky` | `40` | ZE DESIGNU (lepivá hlavička) |
| `--z-bar` | `50` | ZE DESIGNU (fixní spodní lišta) |
| `--z-overlay` | `60` | ZE DESIGNU (scrim modálu) |
| `--z-dropdown` | `70` | VYMYŠLENO |
| `--z-toast` | `80` | VYMYŠLENO |
| `--z-tooltip` | `90` | VYMYŠLENO |
| `--scrim` | `rgba(10,10,10,0.6)` | ZE DESIGNU, doslova (3×) |
| `--modal-w-sm` | `460px` | ZE DESIGNU (`width:min(460px,100%)`) |
| `--modal-w-md` | `620px` | ZE DESIGNU (hromadná akce) |
| `--menu-min-w` | `246px` | ZE DESIGNU (avatar menu `width:246px`) |
| `--tab-indicator-h` | `3px` | ZE DESIGNU (`border-bottom:3px solid`) |
| `--tooltip-max-w` | `240px` | VYMYŠLENO (design tooltip nemá) |
| `--toast-w` | `380px` | VYMYŠLENO (design toast nemá) |

Do Tailwind bridge (`theme.css`) se mapuje **jen `--scrim`** jako
`--color-scrim` (je to barva, takže má utilitu `bg-scrim`). Zbytek se konzumuje
jako arbitrary value.

## Proč

- **Overlay komponenty nemají kam sáhnout.** `colors_and_type.css` popisuje
  plochou stránku – nezná pořadí vrstev, ztmavené pozadí ani šířku dialogu.
  Bez tokenů by v primitivech skončily inline hodnoty (`z-[60]`,
  `bg-[rgba(10,10,10,0.6)]`, `max-w-[460px]`), což ruší global constraint 5.
- **Vrstvení musí být jedna škála.** Kdyby si každá komponenta zvolila `z-index`
  sama, dvě z nich se dřív nebo později shodnou a pořadí začne záviset na pořadí
  v DOM. Tři hodnoty z designu (40/50/60) škálu zakotvují; tři nad nimi jsou
  vymyšlené, ale jejich **pořadí** je to podstatné:
  - menu se otevírá od triggeru a musí přebít lišty kolem sebe,
  - toast musí přebít menu, protože může přijít, když je menu otevřené,
  - tooltip je úplně nahoře, protože může popisovat cokoli z výše uvedeného –
    včetně zavíracího tlačítka toastu.
  Mezery po deseti nechávají místo vsunout vrstvu bez přečíslování.
- **`--scrim` nejde poskládat z neutrálů.** Je to průsvitná čerň, kdežto každý
  `--neutral-*` je krycí.
- **`--tab-indicator-h` musí být token.** 3px není na škále `--space-*` (ta
  začíná na 4px) a není to ani jeden z Tailwindích kroků `border-b-*` (1/2/4/8).

## Jak

- `overlays.ts` má u každé položky napsané, jestli je ZE DESIGNU nebo
  VYMYŠLENÁ – stejná konvence jako `controls.ts` (`doc/decision/0011-*`) a
  `layout.ts` (`0009`).
- Generátor `generate-css.ts` je rozšířen o sekci `Overlays and layering`;
  drift test `generate-css.spec.ts` tím pádem hlídá i nové tokeny.
- V `theme.css` je u nemapovaných tokenů komentář, proč se nemapují: Tailwind v4
  nemá namespace `--z-index-*` ani `--border-width-*`. Konzumace:

  ```
  z-[var(--z-overlay)]
  max-w-[var(--modal-w-sm)]
  min-w-[var(--menu-min-w)]
  border-b-[length:var(--tab-indicator-h)]
  ```

  Nápověda `length:` u posledního je **povinná**: `border-b-[var(--x)]` je pro
  Tailwind nejednoznačné a přečetl by to jako barvu rámečku. Ověřeno na
  vygenerovaném CSS ze Storybook buildu – emituje se
  `border-bottom-width:var(--tab-indicator-h)`.

### Zaokrouhlení proti designu

| místo v designu | design | použito | rozdíl |
| --- | --- | --- | --- |
| padding modálu | 28px | `p-6` (24px) | −4px |
| padding položky menu | 10px 12px | `px-3 py-3` (12px) | +2px svisle |
| mezera mezi položkami menu | 2px | `gap-1` (4px) | +2px |
| poloměr modálu | 24px | `rounded-lg` | 0 |
| stín modálu i menu | `0 20px 48px rgba(35,34,31,0.12)` | `shadow-lg` | 0 |
| poloměr menu | 16px | `rounded-md` | 0 |
| poloměr položky menu | 12px | `rounded-sm` | 0 |

Stejný princip jako v `0011`: raději krok ze škály než nový token pro každou
jednotlivou hodnotu. Žádná odchylka není větší než 4px.

## Riziko

- **Vymyšlené hodnoty projdou až vizuálním review.** `--tooltip-max-w`,
  `--toast-w` a tři horní `z` vrstvy nemají v designu předlohu. Všechny jsou
  jednořádková změna v `overlays.ts` + přegenerování CSS.
- **`z-index` dropdownu je lokální.** Dropdown není portál, takže jeho
  `z-[var(--z-dropdown)]` platí uvnitř stacking contextu triggeru. V lepivé
  hlavičce (`z-index:40`) tedy menu **nepřebije** modál na 60, i když má 70 –
  což je správně, ale je to nečekané, kdyby někdo hodnoty četl jako globální.
- **Modal je portál, dropdown ne.** Kdyby někdo dropdown na portál převedl,
  začnou hodnoty platit globálně a chování se změní. Proto je to napsané
  v docstringu obou komponent.
