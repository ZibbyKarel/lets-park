# 0006 – Nx layout: `project.json` + path aliasy v `tsconfig.base.json`

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

Workspace používá **klasický Nx layout**, ne novější „TS solution setup":

- každý projekt má vlastní `project.json` (`--useProjectJson`),
- libs se rozlišují path aliasy v `tsconfig.base.json`
  (`"@lets-park/contract": ["./libs/contract/src/index.ts"]`),
- **ne** npm workspaces + TypeScript project references (`--no-workspaces`).

## Proč

`create-nx-workspace` dnes defaultně nabízí TS solution setup (npm workspaces,
`references`, `nx sync`). Pro tento projekt je klasický layout výhodnější:

- **Žádný `nx sync`.** V TS solution setupu se po přidání závislosti mezi libs musí
  regenerovat `references`; v neinteraktivním běhu (CI, subagent) task místo běhu
  spadne s výzvou „run nx sync". Přes projekt jde 29 úkolů, které postupně přidávají
  13 libs – tenhle paper cut by se opakoval pořád dokola.
- **Jeden greppovatelný seznam.** Všechny entry pointy jsou na jednom místě
  v `tsconfig.base.json`, což odpovídá rozhodnutí 0005 (scope `@lets-park`) a usnadňuje
  kontrolu, že žádná lib nevzniká mimo scope.
- **Zdroj místo buildu.** Libs se resolvují na `src/index.ts`, takže `lint`, `test`
  i `typecheck` nepotřebují libs nejdřív buildovat. Rychlejší a méně stavů, ve kterých
  může běh selhat.

Subpath entry pointy (`@lets-park/contract/realtime` podle `plan.md`) fungují v obou
variantách – v klasickém layoutu jako druhý záznam v `paths`.

## Jak

- Workspace vygenerován přes `create-nx-workspace@23.1.2 --preset=apps
  --workspaceType=integrated --no-workspaces --useProjectJson --pm=npm --nxCloud=skip`.
- Scope `@lets-park` plyne z názvu root `package.json` (`@lets-park/source`); generátory
  Nx z něj odvozují alias automaticky – ověřeno vygenerováním a smazáním testovací lib.
- Nové libs se přidávají generátorem, který alias do `tsconfig.base.json` doplní sám
  (viz `doc/workspace.md`).

## Riziko, když je to špatně

Nx podporuje oba layouty a nabízí migraci do TS solution setupu; přechod je ale plošný
zásah do všech `tsconfig.json` a `package.json` v repu. Kdyby se ukázalo, že projekt
potřebuje buildovatelné publikovatelné balíčky (což MVP nepotřebuje – deployuje se
jedna instance), je to práce na jeden dedikovaný úkol, ne rozhodnutí, které by blokovalo
cokoliv dřív.
