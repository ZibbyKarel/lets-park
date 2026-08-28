# 0030 – `useAppForm` obsahuje jeden zdůvodněný type cast na `zodResolver`

**Datum:** 2026-08-28 · **Stav:** přijato · **Task:** 18 (`libs/form`)

## Co

`useAppForm` (`libs/form/src/lib/use-app-form.ts`) volá `zodResolver(schema)` a výsledek
přetypuje: `zodResolver(schema) as unknown as Resolver<z.input<TSchema>, unknown,
z.output<TSchema>>`. Je to jediné místo v `libs/form`, kde se typová kontrola obchází —
veřejné API (`UseAppFormOptions`, `AppForm`, signatura `useAppForm`) zůstává beze změny plně
typované.

## Proč

`zodResolver` z `@hookform/resolvers/zod` je samo generické a svoje generika (`Input`,
`Context`, `Output`) odvozuje **ze svého argumentu** `schema`. Uvnitř `useAppForm<TSchema
extends z.ZodType<FieldValues, FieldValues>>` je ale `schema` typu `TSchema` — tedy pořád
obecný typový parametr, ne konkrétní schéma. TypeScript v tomhle bodě umí `z.input<TSchema>`
a `z.output<TSchema>` vyhodnotit jen vůči **omezení** (`constraint`) `TSchema`
(`z.ZodType<FieldValues, FieldValues>`), ne vůči jeho budoucí konkrétní instanci — takže ať
už se generika `zodResolver` nechají odvodit sama, nebo se předají explicitně, výsledek se
vždy zúží na `Resolver<FieldValues, unknown, FieldValues>`, které strukturálně neodpovídá
`Resolver<z.input<TSchema>, unknown, z.output<TSchema>>`, jaký čeká `useForm` níž.

Vyzkoušeny byly obě cesty bez castu (viz `use-app-form.ts`, dřívější revize) — obě padají na
`tsc` s obdobnou chybou (`exactOptionalPropertyTypes` na prvním pokusu, plné
`No overload matches this call` na druhém). Je to typová limitace obalování jedné generické
funkce jinou generickou funkcí přes ještě nedosazený typový parametr, ne skutečná
neshoda typů: na každém volajícím místě je `TSchema` konkrétní a `zodResolver` běží přesně
podle dokumentace `@hookform/resolvers/zod` (ověřeno přes context7, viz global constraint 10).

## Jak

- Cast jde přes `unknown` (`as unknown as Resolver<...>`), protože `tsc` přímý cast mezi
  `Resolver<FieldValues,…>` a `Resolver<z.input<TSchema>,…>` odmítá jako „nedostatečně se
  překrývající" — jde o standardní TypeScript idiom pro tenhle typ konverze, ne o obcházení
  chyby.
- Cast je opatřený komentářem v kódu, který vysvětluje přesně tohle zdůvodnění, aby se
  příště nezaměnil za nedbalost.
- Nikde jinde v `libs/form` se `any` ani neopodstatněný cast nepoužívá — `FormField` a
  `FormProvider` jsou plně typované bez escape hatch.

## Riziko, když je to špatně

Kdyby `@hookform/resolvers` v budoucí verzi změnilo tvar `ResolverOptions`/`Resolver` tak,
že by se runtime chování rozešlo s tím, co cast tvrdí, `tsc` by to **neodhalil** — cast
typovou kontrolu na tomhle jednom řádku vypíná. Zmírňuje to `use-app-form.spec.tsx` a
`app-form.spec.tsx`: obě demonstrují reálné submitování a validaci přes skutečný
`zodResolver`, takže regrese v runtime chování (na rozdíl od typů) padne na testu, ne jen
tiše projde.
