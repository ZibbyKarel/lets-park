# 0019 – Návrh a potvrzení hromadné rezervace mají stejný tvar, rozdíl počítá klient

**Datum:** 2026-08-28 · **Stav:** přijato · **Navazuje na:** `doc/decision/0004-*` §Hromadná rezervace

## Co

`previewBulk` a `confirmBulk` berou **stejný vstup** (`{ dates: DateOnly[] }`) a vrací **stejně
tvarovaný výstup**: pole `days`, kde každý den je diskriminovaná unie

```
SPOT_ASSIGNED { date, parkingSpotId, parkingSpotLabel, isPreferredSpot }
QUEUED        { date, parkingSpotId, parkingSpotLabel, waitlistPosition }
UNAVAILABLE   { date, reason }
```

Výsledek z `confirmBulk` navíc nese id zapsaného řádku (`reservationId`, resp. `waitlistEntryId`).
Každá varianta výsledku je tedy **nadmnožinou** odpovídající varianty návrhu.

**Rozdíl mezi návrhem a skutečností počítá frontend** tím, že si obě pole spáruje podle `date`.
Server ho nepočítá, protože ho spočítat nemůže — viz níže.

Kromě toho:

- **Chyby vs. per-day výsledek.** Věci, které zneplatní celý požadavek (zamčené okno, den
  v minulosti), jsou deklarované chyby procedury. Věci, které se týkají jednoho dne
  (`ALREADY_HAS_RESERVATION`, `NOT_A_BUSINESS_DAY`, `NO_SPOTS_AVAILABLE`), jsou
  `UNAVAILABLE` uvnitř **úspěšné** odpovědi. Jeden nemožný den nesmí zahodit zbytek dávky.
- **`previewBulk` deklaruje okenní chyby stejně jako `confirmBulk`.** Navrhnout rozvrh na měsíc,
  který uživatel nesmí rezervovat, znamená ukázat mu plán, který nikdy nepotvrdí.
- **Vstupní schéma validuje jen strukturu**: neprázdný seznam, max 31 dnů, bez duplicit, všechny
  dny v jednom měsíci. **Nevaliduje** víkendy, svátky ani minulost.

## Proč

**Proč server nepočítá rozdíl.** Aby to uměl, musel by v `confirmBulk` vidět návrh, který
uživatel schválil. Zadání ale říká „vstup: tentýž seznam dnů", a je to správně: kdyby klient
posílal plán zpátky, server by mu buď musel věřit (a pak by šlo podstrčit cizí místo), nebo by
si ho stejně musel přepočítat (a pak je posílání zbytečné). Přepočet uvnitř transakce
nepomůže — rozdíl vzniká **mezi** náhledem a potvrzením, ne uvnitř zápisu.

Klient přitom návrh drží: právě ho uživateli ukázal. Spárování podle `date` je pár řádků a
data k tomu má. Kontrakt tedy nemá rozdíl počítat, má ho udělat **spočitatelným** — a to dělá
tím, že obě odpovědi mají identickou strukturu a stejný klíč.

**Proč je rozdíl čitelný i bez návrhu.** Uživatel může mezitím obnovit stránku. I tak výsledek
sám o sobě říká dost: `QUEUED` znamená „místo jsi nedostal", `isPreferredSpot: false` znamená
„nedostal jsi to svoje". Summary (`assigned` / `queued` / `unavailable` / `preferredSpotHits`)
dá titulek modalu bez jakéhokoliv porovnávání.

**Proč víkendy a svátky nevaliduje schéma.** Bylo by to lákavé — `isBusinessDay` je čistá funkce
v `libs/shared-types` a kontrakt na ni vidí. Ale je to **den-eligibilita**, stejná kategorie jako
„není v minulosti" a „je v otevřeném okně", které ruling window-2 posílá do service vrstvy.
Kdyby jedno pravidlo ze tří žilo ve schématu, uživatel by dostal `VALIDATION_FAILED` na svátek a
`RESERVATIONS_LOCKED` na zamčený měsíc — dvě různé kategorie chyb pro jeden druh problému. Navíc
by případná chyba v tabulce svátků blokovala požadavek dřív, než k ní kdokoliv může přidat
výjimku. Struktura seznamu (duplicity, jeden měsíc, délka) naopak do schématu patří: to je fakt
o seznamu, ne o světě.

**Proč `UNAVAILABLE` a ne chyba.** Bez něj by alokátor neuměl popsat den, na kterém uživatel už
rezervaci má — a celá dávka by musela buď spadnout, nebo ten den tiše vynechat. Tiché vynechání
je horší než obojí: uživatel by nevěděl, že se něco nestalo.

## Jak

- Schémata a obě procedury: `libs/contract/src/api/bulk.ts`.
- Výčty `BULK_DAY_OUTCOMES` a `BULK_UNAVAILABLE_REASONS` a konstanta `MAX_BULK_BOOKING_DAYS`
  jsou v `libs/shared-types` (jako všechny doménové výčty), aby na ně viděla i `libs/i18n`
  pro českou copy.
- Zip na frontendu (Task 31):

  ```ts
  const byDate = new Map(preview.days.map((day) => [day.date, day]));
  result.days.map((actual) => ({ actual, proposed: byDate.get(actual.date) }));
  ```

- Alokátor sám (pořadí míst, chování při kolizi) je Task 30. Kontrakt jeho strategii nepředepisuje,
  jen tvar odpovědi.

## Riziko, když je to špatně

Kdyby se ukázalo, že rozdíl musí počítat server (třeba kvůli auditu „co jsme slíbili"), znamená to
**rozšíření vstupu `confirmBulk`** o návrh a jeho podpis — tedy změnu kontraktu, ne jen
implementace. To je vědomě odložené: přidat pole do vstupu jde zpětně kompatibilně, odebrat ne.

Menší riziko je v `UNAVAILABLE` důvodech — jsou tři a vymyšlené dopředu. Když Task 30 narazí na
čtvrtý, přidá se tuple v `shared-types`, což je jednořádková změna, kterou test na složení výčtu
ukáže v diffu.
