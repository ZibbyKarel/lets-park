# 0004 – Rozsah MVP zahrnuje i funkce, které jsou jen v designu

**Datum:** 2026-08-28 · **Stav:** přijato (rozhodl uživatel) · **Mění:** `plan.md` §Doménový model, §Byznys pravidla

## Co

Do MVP patří i tři funkce, které jsou v hotovém designu, ale v doménovém modelu `plan.md`
chybí. Tam, kde si odporují, **vyhrává design**:

### 1. Rezervační okno se zámkem

Nová entita nastavení (singleton) `ReservationWindowSettings`:

| Pole | Typ | Default |
| --- | --- | --- |
| `openDaysBefore` | int (1–31) | `7` |
| `lockMode` | `AUTO` \| `FORCE_OPEN` \| `FORCE_LOCKED` | `AUTO` |

Odvození stavu měsíce (přesně dle `doc/design/lets-park-design.dc.html`, fce `monthOpen`,
ř. 546–554):

```
isMonthOpen(targetDate, openDaysBefore, lockMode, today):
  FORCE_OPEN   -> true
  FORCE_LOCKED -> false
  AUTO         -> first = 1. den měsíce targetDate
                  from  = first - openDaysBefore dní
                  return today >= from && today < first
```

Tři zobrazované stavy měsíce: `Zatím neotevřeno` (dnes < from), `Otevřeno`
(from ≤ dnes < first), `Uzamčeno` (dnes ≥ first). Tj. **jakmile měsíc začne, je uzamčený** —
běžná rezervace na aktuální měsíc už nejde.

Dopad na pravidla:

- V uzamčeném měsíci **běžný uživatel nesmí**: vytvořit rezervaci, přidat se do fronty,
  odejít z fronty, spustit hromadnou rezervaci.
- V uzamčeném měsíci **běžný uživatel smí**: zrušit svoji vlastní rezervaci (kdykoliv).
- **Admin není omezen** rezervačním oknem vůbec.
- Kontrola je na backendu (nejen v UI) a vrací nový error kód `RESERVATIONS_LOCKED`.

Toto pravidlo **nahrazuje** formulaci z `plan.md` „maximálně do konce následujícího měsíce".
Horizont je nadále omezený, ale jeho hranicí je rezervační okno, ne pevné „konec příštího
měsíce". Zachovává se: rezervovat lze jen dnešek a budoucnost (Europe/Prague).

### 2. Hromadná rezervace

Dvoukrokový flow (`doc/design/screens/10-modal-bulk.png`):

1. **Výběr dní** – kalendářní mřížka měsíce (sloupce PO–NE). Víkendy a české svátky nelze
   vybrat. Vybírá se v rámci jednoho měsíce.
2. **Návrh rozvrhu** – server pro každý vybraný den navrhne: preferované místo (je-li volné)
   → jiné volné místo → zařazení do fronty s pozicí. Uživatel návrh vidí a potvrdí
   („Potvrdit rozvrh"), nebo se vrátí k výběru.

Návrh je **read-only výpočet** (nic nerezervuje). Potvrzení je jedna transakce; dny, které
mezitím obsadil někdo jiný, spadnou do fronty — výsledek se uživateli vrátí, ne zahodí.
Respektuje pravidlo max 1 rezervace na uživatele a den.

### 3. Preferované parkovací místo

Nové nullable pole `User.preferredParkingSpotId`. Nastavuje se v profilu
(`doc/design/screens/11-settings.png`), používá se **výhradně** jako první volba
při hromadné rezervaci. Nemá vliv na běžnou jednodenní rezervaci.

### 4. ICS zůstává

Sekce ICS v nastavení profilu v designu **není**, ale `plan.md` ji vyžaduje — doplní se
ve stejném vizuálním stylu (viz Task 26).

## Proč

Uživateli byly předloženy tři varianty rozsahu (jen `plan.md`, `plan.md` + rezervační okno,
celý design) a explicitně zvolil **celý rozsah designu**. Z chatu u designu je navíc vidět,
že rezervační okno si vyžádal záměrně a popsal reálné firemní pravidlo („rezervování míst je
typicky možné jen týden před novým měsícem na nový měsíc"). Design je tedy novější než
`plan.md` a v konfliktu má přednost.

## Jak

Funkce se **nevkládají jako samostatná fáze**, ale rozpouštějí do stávajících fází, aby
zůstalo contract-first pořadí:

| Kde | Co přibývá |
| --- | --- |
| Task 3 (schémata) | `ReservationWindowSettings`, `MonthLockState`, `User.preferredParkingSpotId`, error kód `RESERVATIONS_LOCKED`, čistá funkce `isMonthOpen` v `libs/shared-types` |
| Task 4 (oRPC kontrakt) | čtení/změna nastavení okna, přehled stavů měsíců, návrh a potvrzení hromadné rezervace, nastavení preferovaného místa |
| Task 9 (Prisma) | tabulka nastavení (singleton), FK `preferredParkingSpotId` |
| Task 12 (moduly) | admin správa rezervačního okna, preferované místo v user settings |
| Task 13 (rezervace) | vynucení zámku u create/join/leave; zrušení vlastní rezervace zůstává povolené |
| **Task 30 (nový)** | backend alokátor a transakce hromadné rezervace |
| Task 24 (parkoviště) | banner stavu okna, dlaždice „rezervace uzamčeny", modal s vysvětlením |
| **Task 31 (nový)** | FE modal hromadné rezervace |
| Task 26 (nastavení) | preferované místo + ICS sekce |
| Task 27 (admin) | záložka „Rezervační okno" |

## Riziko, když je to špatně

Největší nejistota je hromadná rezervace: v designu je alokátor jen naznačený dummy kódem,
takže konkrétní strategie (pořadí míst, chování při konfliktu) je náš návrh. Když se
nestrefíme, mění se jedna služba na backendu a jeden modal na FE — kontrakt a datový model
zůstávají. Rezervační okno je naopak v designu popsané jednoznačně včetně výpočtu, tam riziko
prakticky není.
