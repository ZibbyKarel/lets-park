# 0001 – Paralelní běh fází přes git worktrees

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

Fáze z `plan.md` se implementují subagenty. Nezávislé fáze běží **paralelně**, každá
paralelní větev ve vlastním git worktree; po čistém review se větev merguje do
`feat/lets-park-mvp` a teprve na mergnutém stavu se pouští fázová brána
(`nx run-many -t lint,test,build`).

Topologie vln:

| Vlna | Větev A (hlavní strom) | Větev B (worktree) |
| --- | --- | --- |
| 1 | Task 1–2 (Fáze 0 scaffolding) | – |
| 2 | Task 3–5 (Fáze 1 kontrakt) | Task 6–8 (Fáze 2+3 design systém) |
| 3 | Task 9–16 (Fáze 5 backend) | Task 17–22 (Fáze 4 wrapper libs) |
| 4 | Task 23–27 (Fáze 6 frontend) | – |
| 5 | Task 28–29 (Fáze 7 e2e + provoz) | – |

## Proč

- Uživatel to explicitně zadal („implementuj na sobě nezávislé fáze paralelně").
- Skill `subagent-driven-development` jinak paralelní implementační subagenty zakazuje
  kvůli konfliktům v jednom pracovním stromu. Instrukce uživatele má přednost, ale
  konflikty jsou reálné → řešíme je izolací, ne ignorováním.
- `plan.md` požaduje striktní pořadí fází. Paralelizujeme jen tam, kde mezi fázemi
  **není datová ani typová závislost**: kontrakt (Zod/oRPC) nezávisí na design systému
  a naopak; backend nezávisí na FE wrapper vrstvách.

## Jak

- Každá paralelní větev dostane vlastní worktree (`Agent` tool, `isolation: "worktree"`).
- Worktree nemá `node_modules` ani gitignorované soubory → agent si spustí `npm install`,
  zadání (brief) dostane absolutní cestou do hlavního stromu.
- Očekávané konflikty při mergi jsou jen ve sdílených konfigurácích
  (`package.json`, `package-lock.json`, `tsconfig.base.json`, `nx.json`, ESLint config).
  Řešení: vzít obě strany ručně, `package-lock.json` regenerovat přes `npm install`.
- Fázová brána `plan.md` (buildne se, testy prochází) se vyhodnocuje **až na mergnutém
  stavu**, ne uvnitř worktree.

## Riziko, když je to špatně

Merge konflikty v Nx konfiguraci mohou stát víc času, než paralelizace ušetří. Fallback:
zbylé vlny doběhnout sériově v hlavním stromu – změna je lokální (jen dispatch strategie),
už hotové commity se nezahazují.
