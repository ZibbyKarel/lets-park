# 0018 – Error kontrakt se na oRPC mapuje 1:1, `details` = `data`

**Datum:** 2026-08-28 · **Stav:** přijato · **Navazuje na:** Task 3 (`errorShapeSchema`)

## Co

Task 3 zavedl jednotný tvar chyby `{ code, message, details? }` a uzavřený výčet dvanácti
`ERROR_CODES`. oRPC má vlastní mechanismus typovaných chyb, kde se chyba deklaruje jako
`.errors({ KOD: { status, message, data } })` a na drátě má tvar `{ code, message, data }`.

Rozhodnutí: **nezavádí se žádná další vrstva.** Náš výčet je přímo klíčem oRPC error mapy,
`errorShapeSchema.details` a oRPC `data` jsou **totéž pole pod dvěma jmény**.

Konkrétně:

- `libs/contract/src/api/errors.ts` drží `ERROR_DEFINITIONS` — jednu definici na každý kód,
  s HTTP statusem a defaultní (vývojářskou, anglickou) zprávou. `satisfies Record<ErrorCode, …>`
  hlídá, že seznamy nemůžou utéct od sebe; test to navíc ověřuje za běhu.
- `contractErrors('NOT_FOUND', 'CONFLICT')` je typovaný `Pick` — procedura deklaruje jen kódy,
  které opravdu umí vrátit, a klient jiné nevidí.
- `FORBIDDEN` je deklarovaný **jednou** na sdíleném builderu `authed`, protože je dosažitelný
  úplně všude: deaktivovaný uživatel (`active: false`, tak funguje offboarding) je odmítnutý
  dřív, než se spustí jakýkoliv handler.

Mapování statusů:

| kód | status | | kód | status |
| --- | --- | --- | --- | --- |
| `SPOT_ALREADY_RESERVED` | 409 | | `ALREADY_IN_WAITLIST` | 409 |
| `RESERVATION_LIMIT_REACHED` | 409 | | `CANNOT_WAITLIST_OWN_SPOT` | 422 |
| `PAST_DATE` | 422 | | `SPOT_NOT_OCCUPIED` | 409 |
| `OUT_OF_HORIZON` | 422 | | `VALIDATION_FAILED` | 400 |
| `NOT_FOUND` | 404 | | `CONFLICT` | 409 |
| `FORBIDDEN` | 403 | | `RESERVATIONS_LOCKED` | **423** |

## Proč

**Proč nepřejmenovat `details` na `data`.** `errorShapeSchema` prošlo review Tasku 3 a používá
ho i popis chyb v `doc/kontrakt.md`. Přejmenování by byl churn bez užitku: pole je stejné,
jméno se liší jen tím, odkud se na ně díváš. Frontend ho nikdy nečte přes
`errorShapeSchema` — čte typovanou chybu z oRPC klienta, kde se jmenuje `data`.

**Proč nevlastní obálka.** Alternativou bylo vracet `errorShapeSchema` jako *úspěšný* výsledek
(styl `{ ok: false, error }`). To by zahodilo celý smysl oRPC typovaných chyb: klient by musel
větvit ručně, TypeScript by nehlídal, že procedura vrací jen deklarované kódy, a HTTP status by
byl vždy 200. Contract-first znamená využít mechanismus, který kontrakt nabízí.

**Proč 423 pro `RESERVATIONS_LOCKED`.** Oba „okenní" kódy musí být na první pohled rozlišitelné
i v logu a v proxy, kde `code` nikdo nečte. `OUT_OF_HORIZON` (měsíc se teprve otevře) je
422 — požadavek dává smysl, jen ne teď. `RESERVATIONS_LOCKED` je 423 Locked, což je přesně
sémantika zavřeného okna.

**Proč `data` volitelné.** Většina chyb nepotřebuje nic navíc; těch pár, které ano (id kolidující
rezervace, který měsíc je zamčený), ho pošle. Povinné `data` by nutilo posílat `{}`.

## Jak

```ts
export const createReservationContract = authed          // deklaruje FORBIDDEN
  .input(createReservationInputSchema)
  .output(createReservationOutputSchema)
  .errors(contractErrors('NOT_FOUND', 'SPOT_ALREADY_RESERVED', /* … */));
```

Backend (Task 12/13) chybu hází přes `errors.SPOT_ALREADY_RESERVED({ data: { … } })`. Globální
exception filter v `apps/api` je poslední pojistka pro cokoliv netypovaného.

Nový kód se přidává **ve třech krocích a v tomhle pořadí**: `ERROR_CODES` (Task 3 soubor) →
`ERROR_DEFINITIONS` (status + zpráva) → `contractErrors(...)` na konkrétních procedurách.
Test `errors.spec.ts` spadne, když se vynechá druhý krok, `router.spec.ts` když třetí.

## Riziko, když je to špatně

Špatně zvolený status je kosmetika — frontend větví na `code`, ne na statusu. Skutečné riziko je
opačné: procedura, která deklaruje kód, jaký nikdy nevrací (šum v typech klienta), nebo naopak
vrací nedeklarovaný (skončí jako „unknown error" a UI ukáže obecnou hlášku). Proto je seznam
kódů na proceduru zapsaný explicitně v `router.spec.ts` — každá změna je vidět v diffu.
