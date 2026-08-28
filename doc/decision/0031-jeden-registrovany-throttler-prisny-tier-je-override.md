# 0031 – Registrovaný throttler je jen jeden, přísnější tier je override

**Datum:** 2026-08-28 · **Stav:** přijato

## Co

`ThrottlerModule` registruje **jediný** throttler jménem `default`
(`THROTTLE_TTL_MS` / `THROTTLE_LIMIT`, výchozí 300 requestů za minutu). Přísnější tier pro
endpointy dosažitelné bez session (`THROTTLE_STRICT_TTL_MS` / `THROTTLE_STRICT_LIMIT`,
výchozí 20 za minutu) **není druhý registrovaný throttler**, ale dekorátor
`@StrictThrottle()` v `apps/api/src/common/throttling/throttle-tiers.ts`, který ten jeden
throttler na dané routě přenastaví.

Task 10 dekorátor **nikam nedává** – jen ho připravuje. Které routy ho dostanou, rozhodují
Tasky 11–12 (očekávaní kandidáti: ICS feed a endpointy směrem k mock OIDC).

`/health/live` a `/health/ready` jsou z rate-limitu vyjmuté přes `@SkipThrottle()`.

## Proč

`@nestjs/throttler` v6 aplikuje **každý registrovaný pojmenovaný throttler na každou routu**.
Kdyby se přísnější tier zaregistroval jako druhý throttler, platil by globálně – celé API by
běželo na 20 requestech za minutu. To je přesný opak toho, co „připravený, ale nepoužitý"
znamená, a je to chyba, která se v testech neprojeví a v provozu se pozná až podle 429 od
běžných uživatelů.

Jediný způsob, jak mít pojmenovanou, konfigurovatelnou a **neaplikovanou** sadu limitů, je
mít ji jako override existujícího throttleru, tedy jako dekorátor.

**Proč se hodnoty čtou přes resolver, a ne přímo.** Dekorátor se vyhodnocuje při načtení
modulu a nemůže si nechat injectnout `ConfigService`. Kdyby se `process.env` četlo eagerně
v těle `StrictThrottle()`, přečetlo by se dřív, než `ConfigModule` env zvaliduje.
`@nestjs/throttler` naštěstí u `ttl`/`limit` přijímá funkci, takže se hodnota bere
**per request** – v tu chvíli už `validateApiEnv` dávno proběhl.

`ENV_DEFAULTS` se importuje z `apps/api/src/env.ts`, aby fallback dekorátoru a `.default()`
v Zod schématu byly tatáž čísla; druhá kopie by se rozešla.

**`ttl` je v milisekundách.** Ve verzi 5 to byly sekundy. Odsud jsou i názvy proměnných se
sufixem `_MS` – aby se hodnota nedala splést při čtení `.env`.

## Jak

```ts
export function globalThrottlerOptions(env: Pick<ApiEnv, 'THROTTLE_TTL_MS' | 'THROTTLE_LIMIT'>) {
  return [{ name: DEFAULT_THROTTLER_NAME, ttl: env.THROTTLE_TTL_MS, limit: env.THROTTLE_LIMIT }];
}

export function StrictThrottle(): MethodDecorator & ClassDecorator {
  return Throttle({
    [DEFAULT_THROTTLER_NAME]: {
      ttl: () => Number(process.env['THROTTLE_STRICT_TTL_MS'] ?? ENV_DEFAULTS.THROTTLE_STRICT_TTL_MS),
      limit: () => Number(process.env['THROTTLE_STRICT_LIMIT'] ?? ENV_DEFAULTS.THROTTLE_STRICT_LIMIT),
    },
  });
}
```

Použití v Tasku 11–12:

```ts
@StrictThrottle()
@Get('ics/:token')
feed() { … }
```

`throttle-tiers.spec.ts` hlídá invariant „registrovaný je právě jeden" a to, že se čísla
v `ENV_DEFAULTS` shodují s fallbackem dekorátoru.

## Riziko, když je to špatně

Úložiště čítačů je **in-memory** – to je v pořádku, dokud běží jedna instance (což je
deklarovaný cíl MVP), ale při horizontálním škálování by každá instance počítala vlastní
limit a efektivní limit by se vynásobil počtem instancí. Upgrade cesta je storage adapter
(`ThrottlerStorage`), ne změna téhle struktury; Redis se v MVP vědomě nepoužívá.

Druhé riziko: až někdo přidá `@StrictThrottle()` na první routu, začne se přísný limit
skutečně vynucovat a chybně nízká hodnota v `.env` se projeví hned. Do té doby je ta
proměnná bez efektu, což svádí ji nastavit „nějak".
