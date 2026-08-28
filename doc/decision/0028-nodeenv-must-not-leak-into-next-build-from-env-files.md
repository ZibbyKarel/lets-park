# 0028 – `NODE_ENV` se do `next build` nesmí dostat z `.env` souborů

**Datum:** 2026-08-28 · **Stav:** přijato · **Navazuje na:** `doc/decision/0009-*`, `doc/decision/0008-*`

## Co

Target `web:build` má v `apps/web/project.json` napevno `options.env.NODE_ENV = "production"`.
Je to jediná věc, kterou ten `build` blok v `project.json` dělá – zbytek (`command`, `cwd`,
`cache`, `inputs`, `outputs`, `dependsOn`) zůstává inferovaný `@nx/next` pluginem a Nx ho
s tímhle blokem slučuje.

Obecné pravidlo, které z toho plyne: **produkční build nesmí dědit `NODE_ENV` z lokálních
`.env` souborů.** Kdyby přibyl další build target, který na `NODE_ENV` závisí, platí pro něj
totéž.

## Proč

Nx exekutor `nx:run-commands` načítá `.env` z rootu workspace **i** z rootu projektu a
vkládá je do prostředí spouštěného procesu. Podle `doc/decision/0009-*` má vývojář obě kopie
(`.env` a `apps/web/.env`) a obě obsahují `NODE_ENV=development` – jsou to dev env soubory,
to je správně a nemá se to měnit.

Next.js si při `next build` nastaví `NODE_ENV=production` **jen když ještě nastavené není**;
hodnotu z `process.env` respektuje. Env soubory načítané samotným Next.js (`@next/env`)
`NODE_ENV` nepřepisují, takže `cd apps/web && next build` projde – ale `nx run web:build`
dostane `NODE_ENV=development` už zvenčí a Next si ho nechá.

Výsledek je build, který je zpola vývojový a zpola produkční. Konkrétně se rozejde
resolvování Reactu: chunky se kompilují proti jedné variantě (`"production"` export
condition), prerender worker si Reakt natáhne přes `"development"` condition – vzniknou dvě
instance Reactu, interní dispatcher je `null` a prerender vlastních Next stránek
`/_global-error` a `/_not-found` spadne na

```
TypeError: Cannot read properties of null (reading 'useContext')
```

Doprovodným příznakem, podle kterého se to pozná, jsou dev-only varování
`Each child in a list should have a unique "key" prop` na `<html>`/`<head>`/`<meta>`
uprostřed produkčního buildu.

**Proč to bylo těžké najít.** Root `.env` je v `.gitignore`, takže selhání je funkcí
lokálního stavu stroje, ne commitnutého kódu. Vzniklo v okamžiku, kdy si vývojář kvůli
`DATABASE_URL` pro Task 9 zkopíroval `.env.example` do rootu – tedy „přesně u Tasku 9",
i když Task 9 nezměnil v `apps/web` ani řádku. Bisect proto nic neukázal a ukázat nemohl.

**Proč ne jiná řešení.**

- *Vyndat `NODE_ENV` z `.env.example`* – env soubory nejsou verzované a musí zůstat čistě
  vývojové; navíc by to nespravilo `apps/web/.env`, který si vývojář udělá stejně, a
  `apps/api` na `NODE_ENV` v prostředí spoléhá (`apps/api/src/env.ts`).
- *`NX_LOAD_DOT_ENV_FILES=false`* – globální vypínač, vypnul by načítání `.env` i tam, kde
  je žádoucí (`api:serve`, `web:dev`).
- *Vypnout prerender / smazat padající stránky* – zakrytí příznaku, ne oprava.

## Jak

```jsonc
// apps/web/project.json
"targets": {
  "build": {
    "options": { "env": { "NODE_ENV": "production" } }
  }
}
```

Ověření, že sloučení s inferovaným targetem nic neshodilo:
`nx show project web --json` musí u `build` pořád ukazovat `"command": "next build"`,
`"cwd": "apps/web"`, `cache`, `inputs`, `outputs` i `dependsOn`.

## Riziko, když je to špatně

Když se ten řádek ztratí (například při refaktoru `project.json` nebo při upgradu `@nx/next`,
kdy někdo `build` blok „uklidí" jako zbytečný), build se rozbije **jen na strojích, které mají
root `.env`** – v CI, kde `.env` neexistuje, projde. To je nejhorší možná varianta: zelené CI
a lokálně nefunkční build. Proto je tady sepsané pravidlo, a ne jen komentář v JSONu (ten
tam je taky, ale komentáře se mažou snáz než decision recordy).
