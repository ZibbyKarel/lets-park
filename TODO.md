# TODO

- [ ] `apps/web`: all routes and URLs should be in English. Note that the URLs
      are Czech today because the interface is (`doc/decision/0029-*`), and the
      e2e page objects address them by name, so this is a product decision plus
      a migration rather than a rename.

- [ ] zbavit se dlouhých souborů - komponent hlavně. spiousta komponent v apps/web je dlouhých přitom můžeme jednoduše vyndat nějakou logiku do custom hooků nebo vyndat nějaký opakující se element do jiného souboru jako vlastní komponentu. Příklad třeba bulk-modal kde celá table může jít ven jako separátní CalendarTable komponenta

- [ ] u komponentových souborů, které patří k sobě jako komponenta+stories+testy+subkomponenty by měly jít do vlastní složky

- [ ] jsem přihlášen jako dev-admin ale nevidím odkaz na stránku /sprava v menu pod user avatarem

- [ ] `libs/design-system` should be one package rather than three nested ones.

- [ ] `libs/shared-types` → `czech-holidays`: is there a library for this? The
      whole file is unsatisfying.

- [ ] flow rezervování míst pro admin usera se liší od flow rezervace normálního usera - user rezervuje pro sebe ale admin může rezervovat pro ostaní uživatele (včetně sebe) tzn musí tam být selector uživatelů, který vybere jméno i spz (měla by jít změnit), případně rezervovat místo pro hosta.

- [ ] Cap registered parking spots at 5 per user per month.

- [ ] pokud má uživatel již auto registrované na vybraný den, rezervace ani přidání se do fronty na parkovací místo nesmí být povolena dokud nezruší současnou rezervaci

- [ ] chybí možnost přidání kategorie parkovacích míst pro adminy v přehledu parkovacích míst na stránce /sprava

- [ ] vybraný den se musí ukládat do URL a extrahovat z URL při page loadu jako defaultní hodnota

- [ ] ~~Drop `libs/query` and import TanStack Query directly in the
      application.~~ **Not actionable as written — it is the opposite of a
      binding rule.** `plan.md`'s mandatory-wrapper table requires that app and
      feature code reach `@tanstack/react-query` only through `libs/query`, and
      `eslint.config.mjs` enforces it (probed: an import of
      `@tanstack/react-query` from `apps/web` is an error). Doing this would
      mean changing `plan.md` first, with the user's agreement, and removing
      the ESLint rule deliberately rather than as a side effect. Kept on the
      list because the underlying question — is the wrapper earning its keep? —
      is a fair one; the answer is not "delete the enforcement".

- [ ] Překlady
  - použít pro překlady next-intl a přeložit stránky do EN po vzoru vzorového příkladu na https://github.com/amannn/next-intl/tree/main/examples/example-app-router. Všechny překlady pujdou do json souborů v /apps/web/messages. Typ se resolvne z cs.json a napíšeme testy, které zkontrolují že existují překlady pro všechny klíče ve všech jazycích.
  - automaticky detekovat jazyk prohlížeče uživatele a nastavit jazyk aplikace CZ pro CZ a SK a jinak EN.
  - přidat přepínač jazyků do menu pod user avatarem
