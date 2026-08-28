# 0003 – Europe/Prague date logika žije v `libs/shared-types`, ne v `libs/i18n`

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

Čistá date-only logika pro zónu Europe/Prague (dnešek, hranice dne, horizont rezervací,
české svátky, parsování/serializace `YYYY-MM-DD`) se implementuje v **`libs/shared-types`**
už ve Fázi 1. `libs/i18n` ji ve Fázi 4 jen re-exportuje a přidává formátování vázané na
next-intl (názvy měsíců, dnů, lokalizované popisky).

## Proč

`plan.md` umisťuje „jedinou implementaci Europe/Prague date logiky" do `libs/i18n`
(Fáze 4), ale zároveň ji potřebují dřívější/paralelní fáze:

- **Fáze 1 (kontrakt)** – validace horizontu rezervací v Zod schématech.
- **Fáze 5 (backend)** – „dnešek" pro pravidlo „rezervovat lze jen dnešek a budoucnost",
  cron joby v Europe/Prague.

Backend přitom nesmí záviset na `next-intl` (frontend knihovna). Kdyby helper zůstal
v `libs/i18n`, buď by ho někdo duplikoval (porušení „jediná implementace"), nebo by
`apps/api` táhlo next-intl.

`plan.md` sám `libs/shared-types` zavádí pro „doménové typy/konstanty nesouvisející přímo
s kontraktem" a explicitně připouští helper „v `libs/i18n` **nebo** `libs/shared-types`"
(§Contract-first, datumová sémantika) – tohle rozhodnutí jen fixuje, která z těch dvou
možností platí.

## Jak

- `libs/shared-types` nemá žádnou runtime závislost na next-intl ani na Zodu.
- Implementace na nativním `Intl` / `Temporal`-free přístupu s explicitní zónou
  `Europe/Prague`; žádný `new Date()` bez zóny v doménové logice.
- ESLint `no-restricted-imports` zakáže v `apps/api` import `libs/i18n`.
- `libs/i18n` re-exportuje veřejné API `libs/shared-types` pod stejnými jmény, aby feature
  kód na FE dál importoval jen `@myorg/i18n` (wrapper pravidlo zůstává v platnosti).

## Riziko, když je to špatně

Pokud by se ukázalo, že svátky/formátování patří jinam, přesun je mechanický – jde o jednu
lib bez závislostí a wrapper v `libs/i18n` drží veřejné API stabilní.
