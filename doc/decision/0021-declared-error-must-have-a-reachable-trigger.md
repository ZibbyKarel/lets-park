# 0021 – Deklarovaná chyba musí mít dosažitelný spouštěč

## Co

Procedura smí v `.errors(...)` deklarovat jen kód, který **opravdu může nastat** a se kterým
klient umí něco udělat. Když je jediný myslitelný spouštěč (a) vyjádřitelný strukturálně ve
schématu, nebo (b) interní stav, na který klient nemá reakci, kód se z deklarace **odstraní**
a pravidlo se přesune tam, kam patří.

Konkrétně, jako oprava nálezů N2 a N3 z review Tasku 4:

- **`admin.window.months`** už nedeklaruje `VALIDATION_FAILED`. Limit délky rozsahu je nově
  strukturální: `MAX_MONTH_WINDOW_SPAN = 24` v `libs/shared-types` a druhý `.refine()` na
  `listMonthWindowsInputSchema`.
- **`me.regenerateIcsToken`** už nedeklaruje `CONFLICT`. Kolize na náhodně vygenerovaném
  tokenu se řeší **retry smyčkou v handleru** (závazek pro Task 12), ne chybou ven.

## Proč

`doc/decision/0018-*` říká, že vrátit nedeklarovaný kód je chyba. Opačný směr je chyba taky,
jen tišší: deklarovaný kód je součást veřejného typu procedury, takže ho frontend musí
obsloužit, `libs/i18n` pro něj musí mít českou copy a QA pro něj musí vymyslet scénář. Když
ten scénář neexistuje, platí se za něj mrtvým kódem a mrtvým překladem napořád.

U obou nálezů byl navíc druhý, konkrétnější důvod:

- **N2 – limit, který klient nemůže znát, není kontrakt.** Původní deklarace popisovala
  „rozsah delší, než kolik měsíců lze spočítat najednou“, ale žádné číslo v kontraktu nebylo.
  Klient se limit mohl dozvědět jedině tím, že ho server odmítne. To je přesně to, čemu se
  contract-first vyhýbá — a hromadná rezervace už to o dva soubory vedle dělá správně
  (`MAX_BULK_BOOKING_DAYS` jako `.max()` na poli `dates`).
- **N3 – „retry“ není chybový stav.** Jediná představitelná příčina `CONFLICT` u regenerace
  ICS tokenu je unique constraint na čerstvě vygenerovaném náhodném řetězci. Uživateli se to
  nedá vysvětlit a nedá se s tím nic dělat než to zkusit znovu — což umí server sám, líp
  a bez kola po síti.

Precedens: commit `b849875` ze stejného důvodu odebral over-deklaraci u `overview.day`.

## Jak

`MAX_MONTH_WINDOW_SPAN` je v `libs/shared-types/src/lib/domain-constants.ts` vedle
`MAX_BULK_BOOKING_DAYS`, protože je to doménová konstanta, ne detail schématu — Task 13 se na
ni bude odkazovat při stránkování admin tabulky.

Počítání rozsahu je lokální funkce `monthSpan()` v `api/reservation-window.ts`. Do
`shared-types` nešla schválně: ta lib vlastní **denní** Europe/Prague logiku, ne počítání
délky `YYYY-MM` rozsahu, a jedno použití nezakládá sdílený helper. Refinementy jsou dva
a v tomhle pořadí — `from <= to` napřed, span až potom — takže `monthSpan()` nikdy nedostane
obrácený rozsah.

Testy: hraniční rozsah přesně 24 měsíců projde, 25 spadne, a `2026-12`→`2027-01` je dva
měsíce, ne třináct (test, že se nepočítá lexikograficky).

Pro Task 12 to znamená závazný úkol: `regenerateIcsToken` generuje token v cyklu, dokud
insert neprojde. Kdyby se ukázalo, že retry nestačí, kód se **napřed** vrátí do kontraktu
a teprve pak ho smí handler vyhodit — pořadí se neobrací.

## Riziko

**Zúžení deklarace je breaking změna, rozšíření není.** Kdyby se ukázalo, že některý z obou
kódů přece jen potřebný je, přidání zpátky změní typ procedury a dotkne se klientů. Riziko je
ale malé: obě procedury zatím nemají implementaci (Task 12, resp. 13), takže se nic nerozbíjí
retroaktivně, a review Tasku 4 obě deklarace označilo za nepravděpodobné nezávisle na téhle
opravě.

**Konkrétní číslo 24 je odhad.** Vychází z toho, že admin tabulka nikdy nezobrazuje víc než
rok dopředu a rok zpátky. Když se ukáže, že je málo, zvětšení konstanty je jednořádková
a nerozbíjí klienty (limit se jen uvolní). Zmenšení by breaking bylo — proto raději velkoryse.

**`monthSpan()` je duplicitní vůči budoucí kalendářní aritmetice.** Až vznikne potřeba
počítat měsíční rozsahy na víc místech, patří to do `libs/shared-types` vedle
`doc/decision/0013-*`; do té doby by přesun byl předčasná abstrakce.
