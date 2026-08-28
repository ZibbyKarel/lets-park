# 0008 – Validace env proměnných webu v `instrumentation.ts`, ne v `next.config.ts`

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

Fail-fast validace env proměnných `apps/web` (`validateWebEnv`, `apps/web/src/env.ts`) se
nevolá z `next.config.ts` na top-levelu, jak by naznačovalo doslovné znění Tasku 2
(„validace při buildu/bootu"). Volá se z `apps/web/src/instrumentation.ts` (Next.js hook
`register()`), a pouze pro Node.js runtime – přes samostatný modul
`apps/web/src/instrumentation-node.ts`, ne inline. Selhání validace navíc končí explicitním
`process.exit(1)`, ne pouhým `throw`.

## Proč

**Proč ne `next.config.ts`.** `next.config.ts` nečte jen `next dev`/`build`/`start` – čte ho
i `@nx/next` plugin při výpočtu Nx project graphu, tedy i `nx run web:lint`,
`web:typecheck`, `nx graph` atd. Ověřeno empiricky: s `validateWebEnv()` na top-levelu
`next.config.ts` selhávalo i `nx run web:typecheck` bez jakéhokoli běžícího serveru, protože
Nx načte `next.config.ts` bez reálného `.env`. Validace v konfiguračním souboru by tedy
blokovala i příkazy, které s runtime env nemají nic společného.

**Proč `instrumentation.ts` → `register()`.** Podle Next.js dokumentace (ověřeno přes
context7, `/vercel/next.js/v16.1.6`) se `register()` volá přesně jednou, když se spouští
nová instance serveru (`next dev` / `next start`) – ne při `nx`/Nx-pluginové introspekci
konfigurace, ne (empiricky ověřeno buildem bez env) při `next build`. To přesně odpovídá
požadavku „spuštění app s chybějící proměnnou skončí pádem" – jde o **boot**, ne o build.

**Proč zvlášť `instrumentation-node.ts`.** `register()` běží v obou runtimech (`nodejs` i
`edge`). Validace používá jen Node-safe kód, ale `process.exit()` v Edge runtimu neexistuje
– Turbopack to při buildu nahlásil jako warning („A Node.js API is used … which is not
supported in the Edge Runtime"), přestože běh chráníme podmínkou
`NEXT_RUNTIME !== 'nodejs' → return`. Runtime podmínka sama nestačí, protože bundler
analyzuje kód staticky pro obě varianty. Přesunutím `process.exit`/`validateWebEnv` do
vlastního modulu, na který se odkazujeme jen přes `await import(...)` uvnitř podmínky (přesně
podle vzoru z Next.js dokumentace pro runtime-specific instrumentation), Turbopack modul do
edge bundlu nezahrne a warning zmizí.

**Proč `process.exit(1)`, ne jen `throw`.** Empiricky ověřeno (`next start` bez env): Next.js
chybu vyhozenou z `register()` odchytí, vypíše „Failed to prepare server" a **server dál
běží** a odpovídá 500 na každý request – proces nespadne. To porušuje požadavek na fail-fast
(„okamžitý pád"). Explicitní `process.exit(1)` po zalogování chyby proces skutečně shodí,
stejným efektem jako výjimka z `ConfigModule.forRoot({ validate })` na API straně.

## Jak

- `apps/web/src/env.ts` – schéma a `validateWebEnv`, bez vazby na to, kdo ji volá.
- `apps/web/src/instrumentation.ts` – `register()`, jen routing podle `NEXT_RUNTIME`.
- `apps/web/src/instrumentation-node.ts` – vlastní validace + `console.error` +
  `process.exit(1)` při chybě. `no-console` zde neplatí (vynucuje se jen v `apps/api/**` a
  `libs/**`, viz `eslint.config.mjs`).
- Ověřeno reálným během: `next build` prochází bez env (build validaci nevolá);
  `next start` bez env skončí (`exit code 1`) s hláškou jmenující všechny chybějící
  proměnné a bez jejich hodnot – výstup je v `task-2-report.md`.

## Riziko, když je to špatně

Pokud budoucí Next.js verze změní, kdy se `register()` volá (např. i při `next build`),
build-time fail-fast už nebude platit vůbec – dnes neplatí ani teoreticky, protože ho žádný
hook nekryje. Zmírnění: `next build` samo o sobě nic runtime-specifického nepotřebuje (env
proměnné z tohoto schématu nejsou čteny žádnou stránkou v Fázi 0), takže mezera je dnes bez
praktického dopadu; jakmile budoucí fáze začnou číst `NEXT_PUBLIC_*` proměnné přímo v
komponentách, chybějící/neplatná hodnota se sice neprojeví jako pád buildu, ale build i tak
selže o krok později (chybějící typ/hodnota v komponentě) – a `nx run web-e2e:e2e` by
takovou konfigurační chybu odhalil při startu dev serveru přes tento stejný hook.
