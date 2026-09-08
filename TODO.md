# TODO

1. [ ] `libs/design-system` should be one package rather than three nested ones.
2. [x] `libs/shared-types` → `czech-holidays`: is there a library for this? The whole file is unsatisfying. (branch todo-2-libs-shared-types-czech-holidays-is-there-a-library-for-this)
3. [ ] flow rezervování míst pro admin usera se liší od flow rezervace normálního usera - user rezervuje pro sebe ale admin může rezervovat pro ostaní uživatele (včetně sebe) tzn musí tam být selector uživatelů, který vybere jméno i spz (měla by jít změnit), případně rezervovat místo pro hosta.
4. [ ] Cap registered parking spots at 5 per user per month.
5. [ ] pokud má uživatel již auto registrované na vybraný den, rezervace ani přidání se do fronty na parkovací místo nesmí být povolena dokud nezruší současnou rezervaci
6. [ ] chybí možnost přidání kategorie parkovacích míst pro adminy v přehledu parkovacích míst na stránce /admin
7. [ ] vybraný den se musí ukládat do URL a extrahovat z URL při page loadu jako defaultní hodnota
8. [ ] ~~Drop `libs/query` and import TanStack Query directly in the application.~~ **Not actionable as written — it is the opposite of a binding rule.** `plan.md`'s mandatory-wrapper table requires that app and feature code reach `@tanstack/react-query` only through `libs/query`, and `eslint.config.mjs` enforces it (probed: an import of `@tanstack/react-query` from `apps/web` is an error). Doing this would mean changing `plan.md` first, with the user's agreement, and removing the ESLint rule deliberately rather than as a side effect. Kept on the list because the underlying question — is the wrapper earning its keep? — is a fair one; the answer is not "delete the enforcement".
9. [ ] Překlady
   - použít pro překlady next-intl a přeložit stránky do EN po vzoru vzorového příkladu na https://github.com/amannn/next-intl/tree/main/examples/example-app-router. Všechny překlady pujdou do json souborů v /apps/web/messages. Typ se resolvne z cs.json a napíšeme testy, které zkontrolují že existují překlady pro všechny klíče ve všech jazycích.
   - automaticky detekovat jazyk prohlížeče uživatele a nastavit jazyk aplikace CZ pro CZ a SK a jinak EN.
   - přidat přepínač jazyků do menu pod user avatarem
10. [ ] pokud existuje jen jeden administrátor v systému tak musíme zařídit že se mu nemůže role administrátora odstranit -> disablujeme toggle
11. [ ] udělat indexy ve složkách doc, doc/decision pro lepší vyhledávání agenty a napsat krátký odstavec do CLaude.md o tom že se mají nejprve dívat na indexové soubory a až pak číst konkrétní.
