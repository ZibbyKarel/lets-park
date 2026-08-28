# 0010 – Datová aritmetika je kalendářní, časová zóna se řeší na jediné hranici

**Datum:** 2026-08-28 · **Stav:** přijato · **Navazuje na:** `doc/decision/0003-date-helpery-v-shared-types.md`

## Co

`libs/shared-types` je rozdělená na dvě vrstvy s ostrou hranicí:

- **`date-only.ts` – čistě kalendářní.** Posun dní, rozdíl dní, porovnání, začátek/konec
  měsíce, den v týdnu. O žádné časové zóně nic neví. Vnitřně počítá přes „epoch day"
  v UTC (`Date.prototype.setUTCFullYear` + `getTime() / 86 400 000`).
- **`prague-time.ts` – jediné místo, které zná `Europe/Prague`.** Převádí mezi okamžikem
  (`Date`) a kalendářním dnem: `todayInPrague()`, `toDateOnlyInPrague()`,
  `startOfDayInPrague()`, `endOfDayExclusiveInPrague()`. Pravidla zóny deleguje na ICU přes
  `Intl.DateTimeFormat` s explicitním `timeZone`, nikdy na lokální čas procesu.

`todayInPrague(now?)` bere okamžik jako nepovinný parametr, aby doménová logika a testy
nemusely sahat na hodiny.

## Proč

Rezervační den je **kalendářní den**, ne okamžik. Jakmile se s ním počítá jako s timestampem,
rozbijí se dva případy:

1. **Přechod letního času.** `2026-03-29` má v Praze 23 hodin a `2026-10-25` má 25 hodin.
   Implementace, která „přidá den" jako `+86 400 000 ms` k lokálnímu času, na těchto dvou
   dnech v roce den přeskočí nebo zopakuje. UTC letní čas nemá, takže aritmetika nad epoch
   day je exaktní vždy.
2. **Zóna stroje.** `new Date()` čtené v lokálním čase dá na serveru v UTC jiný den než na
   notebooku v Praze — mezi 22:00/23:00 UTC a půlnocí je v Praze už zítřek. `Intl` s
   explicitní zónou dá stejnou odpověď všude.

`Intl.DateTimeFormat` je zvolen záměrně místo ruční tabulky offsetů: pravidla letního času
udržuje ICU v runtime, ne my.

## Jak

- `startOfDayInPrague()` odvodí okamžik lokální půlnoci dvouprůchodovou korekcí offsetu
  (offset v odhadu a offset v opraveném okamžiku se přes přechod letního času liší).
- Testy pinují **okamžiky** (`2026-08-27T22:30:00Z`), nikdy hodnoty lokálních hodin,
  a kritické případy se opakují pod několika `process.env.TZ`
  (`UTC`, `Europe/Prague`, `America/Los_Angeles`, `Pacific/Kiritimati`). Implementace,
  která čte lokální čas stroje, projde v jedné zóně a spadne v ostatních.
- Pokryté hraniční případy: obě strany obou přechodů letního času v roce 2026, přelom roku
  (v Praze nastává o hodinu dřív než v UTC), přestupný rok.

## Riziko, když je to špatně

Chyba v této vrstvě je tichá a projeví se dvakrát ročně (rezervace o den vedle) nebo jen
mezi 22:00 a půlnocí. Proto jsou testy postavené na okamžicích a na přepínání zóny procesu —
naivní implementace jimi neprojde. Kdyby se ukázalo, že potřebujeme víc (např. práci
s časovými intervaly), je hranice tak, že přibude funkce v `prague-time.ts` a `date-only.ts`
zůstane nedotčený.
