# 0030 – Transportní chyby si nechávají Nest tvar, neznámé chyby vrací holou 500

**Datum:** 2026-08-28 · **Stav:** přijato · **Navazuje na:** `doc/decision/0018-*`, `doc/decision/0029-*`

## Co

Globální filtr (`apps/api/src/common/filters/contract-exception.filter.ts`) vrací **dva různé
tvary těla**, podle toho, jestli jde o doménovou chybu nebo ne:

1. **Doménová chyba** (`DomainError`, namapovaná Prisma chyba) → oRPC error JSON:
   `{ defined: false, code, status, message, data? }`, kde `code` je člen uzavřeného výčtu
   `ERROR_CODES` a `status` i `message` pochází z `ERROR_DEFINITIONS`. `data` je kontraktní
   `details` pod jménem, které pro totéž pole používá oRPC (`doc/decision/0018-*`).
   `defined` je vždy `false` – chyba, která doletěla až sem, je z definice ta, kterou
   procedura nedeklarovala.
2. **Všechno ostatní** (nenamatchovaná routa, zahozený request od throttleru, tělo přes
   limit, neznámá výjimka) → Nest tvar `{ statusCode, message }`.

Neočekávaná chyba – cokoli, co není `DomainError`, namapovaná Prisma chyba ani
`HttpException` – vrací **konstantní** tělo `{ statusCode: 500, message: 'Internal server
error' }`. `HttpException` se statusem ≥ 500 se tím samým tělem přepíše.

**Stack trace se vždy loguje a nikdy neodesílá.** Každá větev skládá tělo z pevné množiny
polí; původní chyba se dostane jen do `this.logger`.

## Proč

**Proč doménové chyby v oRPC tvaru.** Frontend čte chyby přes oRPC klienta a ten rozumí
jedinému tvaru – `ORPCErrorJSON`, tj. `Pick<ORPCError, 'defined'|'code'|'status'|'message'|'data'>`
(ověřeno v `node_modules/@orpc/client/dist/index.d.mts`, ne z paměti). Kdyby filtr posílal
vlastní tvar, byly by na frontendu dvě cesty pro zpracování chyb: jedna pro chyby, které
procedura deklarovala, druhá pro ty, které spadly do filtru. To je přesně to rozdvojení,
kterému se kontrakt-first přístup vyhýbá.

**Proč transportní chyby ten tvar naopak nedostanou.** Výčet `ERROR_CODES` je uzavřený
(`doc/decision/0016-*`) a nemá – a nemá mít – člena pro „routa neexistuje" nebo „moc requestů".
Vymýšlet pro ně kód by znamenalo otevřít výčet věcem, které nejsou doménové chyby a které
klient neřeší jinak než podle HTTP statusu. Nest pro ně má vlastní zavedený tvar, ten stačí.

**Proč neznámá chyba vrací konstantu.** `error.message` z neošetřené výjimky může obsahovat
connection string, cestu na disku, kus SQL nebo jméno interní funkce. Prohnat ho do odpovědi
„protože je to užitečné pro debugging" znamená debugovat na produkci skrz prohlížeč útočníka.
Užitečné pro debugging je log – tam jde chyba celá, včetně stacku a `x-request-id`, podle
kterého se dohledá.

**Proč se přepisuje i `HttpException` se statusem ≥ 500.** `InternalServerErrorException(err.message)`
je běžný vzorec a stejně tak běžně do zprávy propašuje interní detail. Status 5xx je hranice,
za kterou se tělu nevěří.

## Jak

```ts
const INTERNAL_ERROR_BODY = { statusCode: 500, message: 'Internal server error' };
```

Filtr je registrovaný přes `{ provide: APP_FILTER, useClass: ContractExceptionFilter }`
v `AppModule`, ne přes `app.useGlobalFilters()` v `main.ts` – tak ho dostanou i testy, které
bootují jen modul.

Testy v `contract-exception.filter.spec.ts` obsahují mimo jiné **sweep přes šest druhů
selhání**, který u každého ověří, že se v serializovaném těle neobjeví nejvyšší rámec stacku.
Ten se vytahuje jako `failure.stack.split('\n')[1]` a porovnává se přesně – naivní
`not.toContain('at ')` dává falešný poplach, protože `'at '` je podřetězec anglického textu
v `ERROR_DEFINITIONS` (`„…for th`**`at `**`day."`).

## Riziko, když je to špatně

Dva tvary těla znamenají, že frontend musí umět rozlišit, který dostal. Rozlišovacím znakem
je přítomnost pole `code`; kdyby někdo do transportní větve `code` přidal „pro konzistenci",
frontend by ho začal považovat za člena `ERROR_CODES` a narazil by na hodnotu, kterou výčet
nezná. Transportní tělo proto **nesmí** mít `code`.

Druhé riziko je opačné: přidat do doménové větve pole navíc (třeba `timestamp` nebo `path`).
oRPC klient parsuje `ORPCErrorJSON` a pole navíc zahodí – takže by se to tvářilo neškodně,
jen by ta informace nikdy nikam nedorazila.
