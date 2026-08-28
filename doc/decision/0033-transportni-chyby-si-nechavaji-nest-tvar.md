# 0033 – Transportní chyby si nechávají Nest tvar, neznámé chyby vrací holou 500

**Datum:** 2026-08-28 · **Stav:** přijato · **Navazuje na:** `doc/decision/0018-*`, `doc/decision/0032-*`

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

Z pravidla „5xx tělo se přepisuje" existuje **jediná výjimka**: výsledek health checku
z `@nestjs/terminus` (503). Ten se propouští beze změny – je sestavený z návratových hodnot
našich vlastních indikátorů, neobsahuje `Error` ani stack, a *je* smyslem toho endpointu.
Sonda, jejíž tělo říká „internal server error", operátorovi nesděluje nic.

A dvě věci, které nejsou `HttpException` a filtr je proto musí poznat explicitně:

- **`http-errors` chyby vzniklé před routováním** – v praxi `PayloadTooLargeError` z body
  parseru. Poznají se podle příznaku `expose === true`, kterým `http-errors` sám označuje
  hlášky bezpečné pro klienta (nastavuje ho pro 4xx, ne pro 5xx). Vrací se `{ statusCode,
  message }` na původním statusu, tedy 413.
- **terminus výsledek** – viz výše.

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

**Proč je výjimka pro terminus úzká.** Nestačí „propouštěj objektová těla" –
`new InternalServerErrorException('connect ECONNREFUSED 10.0.0.7:5432')` má taky objektové
tělo (`{statusCode, message, error}`) a je to přesně ten únik, kterému pravidlo brání.
Výjimka proto testuje konkrétní tvar terminus výsledku (`status` ∈ `ok|error|shutting_down`
plus objektové `info`, `error`, `details`) **a zároveň** že jde o `ServiceUnavailableException`.
Test `still replaces an ordinary 5xx body` v `contract-exception.filter.spec.ts` hlídá, že se
ta škvíra nerozšířila.

**Proč `expose`, a ne jen status.** Rozhodovat podle „je to 4xx" by znamenalo poslat ven
hlášku jakékoli cizí knihovny, která si u sebe nese 4xx. `expose` je vlastní kontrakt
knihovny `http-errors` pro „tuhle zprávu je bezpečné ukázat klientovi"; opřít se o něj je
levnější a poctivější než seznam povolených typů chyb.

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

**Třetí riziko, a to se už jednou stalo:** tenhle filtr je poslední článek řetězu, takže
jeho chování **nejde ověřit testem, který volá metodu kontroleru přímo**. První verze
tohohle rozhodnutí tvrdila, že tělo přes limit vrací 413 a že terminus tělo projde ven –
obojí bylo napsané z úvahy a obojí bylo špatně (413 se vracelo jako 500, terminus tělo se
přepisovalo konstantou). Odhalil to až reálný HTTP request. Proto existuje
`apps/api/src/app/http-pipeline.spec.ts`, který pouští requesty proti sestavené aplikaci
a je wirovaný stejnou funkcí `configureApp` jako `main.ts` – **jakékoli další tvrzení
o chování filtru patří ověřit tam**, ne úvahou.
