# 0022 – Názvy realtime eventů a pravidlo „jedna transakce = jeden event“

## Co

Sada eventů `@lets-park/contract/realtime` je uzavřená a jmenuje se podle jednoho pravidla:

- **ven** (server → client) `<předmět>:<příčestí minulé>` — `cell:locked`, `cell:unlocked`,
  `reservation:created`, `reservation:cancelled`, `reservation:reassigned`, `waitlist:updated`,
- **dovnitř** (client → server) `<předmět>:<rozkazovací způsob>` — `day:subscribe`,
  `day:unsubscribe`, `cell:lock`, `cell:unlock`.

Dvojtečka jako oddělovač, malá písmena, předmět v jednotném čísle, obě strany disjunktní.

Dál platí:

1. **Jedna zacommitovaná transakce vyprodukuje právě jeden event.** Zrušení, po kterém se
   povýšil první z fronty, pošle `reservation:reassigned` **místo** `reservation:cancelled`.
2. `reservation:reassigned` nese `cause` z uzavřeného výčtu `RESERVATION_REASSIGN_CAUSES`.
3. Realtime **nešíří stav rezervačního okna**. Vědomá mezera, viz Riziko.

## Proč

**Minulý čas ven je informace, ne stylistika.** Task 15 broadcastuje až po commitu; příčestí
minulé je to, co tenhle fakt v názvu drží. Klient, který dostane `reservation:created`, ví, že
už se nedá vzít zpátky. Rozkazovací způsob dovnitř dělá směr eventu čitelný z názvu bez
nahlédnutí do typu, a hlavně brání kolizi jmen: `cell:lock` (prosba) a `cell:locked` (fakt) se
nedají splést, kdežto jedno `cell:lock` v obou směrech by znamenalo dvě různé věci podle toho,
kdo ho poslal.

**`cell` je jediný nedoménový předmět a je to správně.** Zámek drží dvojici
(`parkingSpotId`, `date`) — jednu buňku mřížky den × místo — a tu dvojici nepojmenuje ani
`spot:`, ani `reservation:`. `spot:locked` by se četlo jako „tohle místo je zamčené každý den",
což je jiná (a neexistující) věc. `plan.md` i zadání Tasku 24 už tomu říkají „cell-lock", takže
přejmenování by navíc rozvázalo kód od zadání. Riziko záměny s `MonthLockState.LOCKED` je
skutečné a řeší se dokumentací na obou místech, ne přejmenováním — viz Riziko.

**Jedna transakce = jeden event** je o tom, co uvidí uživatel. Cancel + create by u všech
klientů v roomu buňku nejdřív probliknulo prázdnou a pak ji přemalovalo; kromě blikání by to
znamenalo, že mezi dvěma pakety existuje stav, který v databázi nikdy nebyl.

Pravidlo má důsledek, který je potřeba říct nahlas: povýšení frontu zkrátilo, ale
`waitlist:updated` se k němu **neposílá** — byl by to druhý event z téže transakce. Nenulové
`fromWaitlistEntryId` je ta informace; klient si počet dekrementuje sám, nebo si den načte znovu.
Alternativa (poslat oba) by pravidlo porušila a přinesla by stejné blikání o úroveň níž, na
badge fronty.

**`reservation:reassigned` je vlastní event** kvůli rulingu `window-1`: automatické povýšení je
systémová akce a zámek rezervačního okna na ni neplatí. Kdyby přišlo jako `reservation:created`,
klient v zamčeném měsíci by musel usoudit, že okno někdo obešel. Jméno říká, že to nebyla akce
uživatele; `cause` říká, která systémová akce to byla — což potřebuje i UI, protože „místo ti
připadlo z fronty" je jiná hláška než „rezervováno".

**`cause` je výčet s jedinou hodnotou.** Boolean by nešel rozšířit bez breaking změny a
`ADMIN_REASSIGNMENT` dnes nemá emitenta — API kontrakt nemá proceduru, která by rezervaci
přesunula mezi uživateli, a člen výčtu, který nikdo nevyprodukuje, je stejná over-deklarace,
jakou zakazuje `doc/decision/0021-*`. Výčet je kompromis: rozšiřitelný a přitom bez mrtvé
hodnoty.

## Jak

Payloady jsou v `libs/contract/src/realtime/events.ts` a `commands.ts`, všechny postavené na
`cellRefSchema` (`date` + `parkingSpotId`). `date` se opakuje v každém payloadu, i když ho room
implikuje: klient bývá připojený do několika day roomů a Socket.io handleru neřekne, kterým
roomem zpráva přišla.

`RESERVATION_REASSIGN_CAUSES` a `CELL_LOCK_RESULTS` leží v `libs/shared-types` vedle ostatních
výčtů, kontrakt je jen obalí `z.enum(...)` — stejný vzor jako `PARKING_GROUPS`
(`doc/decision/0016-*`).

Testy pinují **přesné složení obou sad** v `event-maps.spec.ts` ručním seznamem, takže přidání,
přejmenování nebo ztráta eventu je vidět v diffu, a kontrolují konvenci názvů regexem
`^[a-z]+:[a-z]+$` i disjunktnost obou směrů.

## Riziko

**Záměna `cell:locked` s `MonthLockState.LOCKED`.** Slovo „locked" má v tomhle projektu dva
významy: zavřené rezervační okno celého měsíce a třicetisekundový editační zámek jedné buňky.
Zmírnění: žádný realtime payload nenese stav okna, oba významy jsou explicitně rozlišené
v `doc/kontrakt.md` §Realtime i v hlavičce `events.ts`, a jména jsou různá (`RESERVATIONS_LOCKED`
vs. `cell:locked`). Zbytkové riziko nese hlavně nový člověk v kódu; přejmenování na `hold:*` by
ho odstranilo, ale za cenu rozporu s `plan.md` a zadáním Tasku 24.

**„Jedna transakce = jeden event" je pravidlo, které kontrakt neumí vynutit.** Task 15 může
poslat oba eventy a nic ho nezastaví. Zmírnění: pravidlo je v `doc/kontrakt.md` i v komentáři
u `reservationCancelledEventSchema`, a test tam ověřuje aspoň to, že payload zrušení **nemá**
pole `promoted` ani nového držitele — takže kdo by chtěl posílat oba, nemá čím.

**Chybějící `window:updated`.** Když admin změní okno, banner se u připojených klientů srovná až
při příštím `overview.day`. Vědomé: Task 15 broadcast okna v zadání nemá, a přidat event, který
nikdo neemituje, je stejná chyba jako deklarovat nedosažitelný error kód. Až se ukáže, že to
vadí, přidá se `window:updated` **nejdřív do kontraktu**. Pozor, že by to byl první event, který
nepatří do day roomu — bude potřeba globální broadcast, ne `io.to(roomForDate(...))`.
