# 0023 – Realtime je samostatný vstupní bod a jeho event mapy se odvozují z registru

## Co

`@lets-park/contract/realtime` je **druhý vstupní bod** téže lib, ne sekce prvního:

- `libs/contract/src/realtime/*` neimportuje nic ze `src/api`,
- kořenový `libs/contract/src/index.ts` realtime **nereexportuje**,
- alias `@lets-park/contract/realtime` je v `tsconfig.base.json`,
- izolaci hlídá `src/realtime/no-orpc.spec.ts`, který prochází skutečný modulový graf.

`ServerToClientEvents` a `ClientToServerEvents` se **nepíšou ručně**. Jsou to mapované typy nad
runtime registry `SERVER_TO_CLIENT_EVENT_SCHEMAS` a `CLIENT_TO_SERVER_EVENT_SCHEMAS`, takže
každý typ payloadu je `z.infer`.

## Proč

**Proč vůbec dva vstupní body.** `@lets-park/contract` táhne `@orpc/contract`. Prohlížečový
bundl, který jen otevírá socket, ani Socket.io gateway z toho nemají nic — a co hůř, jeden
barrel by tuhle závislost roztáhl všude, kde se sáhne po realtime typu. Sdílené tvary přitom
zůstávají sdílené: obě větve berou schémata ze `src/schemas`, nic se neduplikuje (global
constraint 1). Kvůli tomu se do `schemas/entities.ts` přesunuly i `userSummarySchema`
a `publicReservationSchema` — potřebuje je přehled dne i broadcast a `realtime` nesmí do `api`.

**Proč to nestačí hlídat ESLintem.** `@orpc/contract` je pro `type:contract` povolený balíček
(API půlka ho potřebuje) a `@orpc/client` je v repu fyzicky nainstalovaný. Nx module boundaries
tedy import `@orpc/*` ze `src/realtime` **propustí**. Jediný poctivý důkaz je modulový graf.

**Proč test s vlastní kontrolou.** Walker, který by kvůli chybě nic nenacházel, by prošel
prázdný — přesně ten druh zeleného výsledku, kvůli kterému tenhle test existuje. Proto stejný
walker musí v `api/index.ts` `@orpc/contract` **najít**; když ho nenajde, padá suite.
Kontroluje se navíc, že graf sahá dál než na vstupní soubor a že nerozeznaný specifier hodí
výjimku místo tichého přeskočení. Obojí bylo ověřeno i opačně: dočasný import `@orpc/contract`
do `realtime/events.ts` shodil dva testy, dočasný import z `../api/errors` tři.

**Proč se mapy odvozují.** Socket.io typuje spojení mapou, jejíž hodnoty jsou **funkční typy**
(`(payload) => void`), a funkční typ Zod popsat neumí — je to jediné místo kontraktu, které samo
není schéma. Ručně psaná mapa by ale byla druhá pravda vedle schémat a mohla by se rozejít.
Mapovaný typ nad registrem to řeší: přidání eventu je jeden řádek v registru a z něj plyne
zároveň runtime validační tabulka pro gateway i compile-time signatura handleru. **Zaregistrovat
event a zapomenout ho validovat není vyjádřitelné** — a to je přesně to, co dělá pravidlo
„server vždy validuje příchozí client→server eventy" totální, ne aspirační.

## Jak

`event-maps.ts` drží tři konstanty: registr odchozích schémat, registr příchozích schémat
a `CLIENT_TO_SERVER_ACK_SCHEMAS` pro podmnožinu příkazů, které odpovídají ackem (dnes jen
`cell:lock`). Mapa `ClientToServerEvents` je podmíněný mapovaný typ: klíč z ack registru dostane
druhý argument `(result) => void`, ostatní ne.

Vstupní payloady jsou `z.strictObject` — neznámý klíč se odmítá, ne zahazuje. Odchozí zůstávají
mírné (neznámé klíče se strippují), protože klient musí snést server nasazený napřed; server
takovou povinnost vůči klientovi nemá.

Alias se testuje nepřímo (`entry-point.spec.ts` čte `tsconfig.base.json` a pinuje cíl), protože
projekt nesmí sáhnout na vlastní zdroje přes vlastní alias — `@nx/enforce-module-boundaries` to
zakazuje a je to správně, přes takový import se dají prát cykly.

## Riziko

**Alias se testuje jen deklarativně.** Že `@lets-park/contract/realtime` opravdu resolvuje
v Jestu i v Next.js buildu, se poprvé ověří v Tasku 15 a 24. Test tady zaručí, že alias existuje
a míří na existující soubor — ne že ho každý resolver umí. Kdyby některý ne, projeví se to hned
při prvním importu ve spotřebiteli, ne skrytě.

**Walker je regex, ne AST.** Sleduje specifiery v `import` / `export … from` / `require` a
schválně přestřeluje — specifier v komentáři by následoval taky. To je bezpečný směr (falešně
padá, nikdy falešně neprojde), ale znamená to, že komentář ve tvaru `from "@orpc/x"`
s uvozovkami by test shodil. Dnešní komentáře používají zpětné apostrofy, takže to nevadí; kdyby
to jednou zavadilo, opravou je AST walk, ne uvolnění pravidla.

**Registry a mapy jsou v jednom souboru s podmíněným mapovaným typem.** Konstrukce je hutná
a při přidání druhého acku ji bude potřeba přečíst pořádně. Alternativa (ručně psané interface)
je čitelnější a rozchází se tiše — což je horší vlastnost než hutnost.
