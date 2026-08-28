# 0031 – `useAppForm` je parametrizované přes `TIn`/`TOut`, ne přes `TSchema` — bez castu

**Datum:** 2026-08-28 · **Stav:** přijato (revidováno po code review Tasku 18) · **Task:** 18
(`libs/form`)

## Co

`useAppForm` (`libs/form/src/lib/use-app-form.ts`) volá `zodResolver(schema)` a jeho výsledek
předá `useForm` **beze castu**. Původní revize byla generická přes `TSchema extends
z.ZodType<FieldValues, FieldValues>` a výsledek `zodResolver` přetypovávala přes
`unknown`; review Tasku 18 ukázal, že přetypování šlo odstranit změnou toho, přes co se
`useAppForm` parametrizuje — tenhle záznam nahrazuje původní verzi, která tvrdila, že
cast je nutný. Nebyl.

## Proč (co nefungovalo a proč)

`zodResolver` z `@hookform/resolvers/zod` je samo generické: `zodResolver<Input, Context,
Output, T extends Zod4Type<Output, Input> = Zod4Type<Output, Input>>(schema: T, …):
Resolver<z4.input<T>, Context, z4.output<T>>` — `T` (a tedy `Input`/`Output`) odvozuje
TypeScript **ze statického typu argumentu** `schema`.

- Ve verzi `useAppForm<TSchema extends z.ZodType<FieldValues, FieldValues>>` byl `schema`
  typu `TSchema` — tedy samotný, dosud nedosazený typový parametr. Když TypeScript odvozuje
  `T` z argumentu, jehož typ je bary typový parametr, umí `T` porovnat jen vůči **omezení**
  (`constraint`) `TSchema`, tj. `z.ZodType<FieldValues, FieldValues>` — ne vůči tomu, čím
  bude `TSchema` na konkrétním volacím místě. Výsledek se proto vždy zúžil na
  `Resolver<FieldValues, unknown, FieldValues>`, což strukturálně neodpovídalo
  `Resolver<z.input<TSchema>, unknown, z.output<TSchema>>`, jaký čekal `useForm` níž — odtud
  cast.
- Řešení: `useAppForm` se parametrizuje přímo přes `TIn extends FieldValues`, `TOut extends
  FieldValues = TIn` (tvary field-values a submitnutých hodnot), a `schema` má typ
  `z.ZodType<TOut, TIn>` — tedy **aplikaci** `TIn`/`TOut` na `z.ZodType`, ne holý typový
  parametr. V tomhle tvaru TypeScript `TOut`/`TIn` z argumentu odvodit umí — stejně jako
  `function unwrap<A>(x: Box<A>): A` umí odvodit `A` z `Box<A>`, i když `A` je pořád
  generické. `zodResolver(schema)` pak vrátí přesně `Resolver<TIn, unknown, TOut>`, což je
  přesně to, co `useForm<TIn, unknown, TOut>` níž očekává — bez castu.

Ověřeno přímo (`tsc --noEmit`, dočasné probe soubory, od té doby smazané): s konkrétním
schématem (`z.object({ name: z.string(), age: z.coerce.number() })`) `tsc` správně přijímá
`form.getValues('name'): string` a `values.age: number` v `handleSubmit`, správně odmítá
tytéž přiřazení s prohozenými typy, a odmítá překlep v názvu pole (`getValues('nam')`) —
tedy typová přesnost je stejná jako u předchozí (castované) verze, jen bez castu.

## Jak

- `UseAppFormOptions<TIn, TOut = TIn>`, `AppForm<TIn, TOut = TIn>`, `useAppForm<TIn, TOut =
  TIn>` — všechny tři generické přes tvar dat, ne přes typ schématu.
- `schema: z.ZodType<TOut, TIn>` — Zod v4 `ZodType<Output, Input>` (v tomto pořadí), viz
  `node_modules/zod/v4/classic/schemas.d.ts`.
- Žádný `as`/`as unknown as` v `use-app-form.ts`; `FormField` a `FormProvider` byly beze
  castu už předtím.

## Riziko, když je to špatně

Žádné nové oproti běžnému psaní generik: pokud `@hookform/resolvers` v budoucí verzi změní
tvar `Zod4Type`/`Resolver` tak, že se `TOut`/`TIn` přestanou z `z.ZodType<TOut, TIn>`
odvozovat, `tsc` to na rozdíl od dřívějšího castu **rovnou nahlásí jako chybu na volajícím
místě** (žádné potichu prošlé přetypování) — to je přesně důvod, proč je tahle verze lepší,
ne jen jinak zapsaná. Běhové chování je navíc dál kryto `use-app-form.spec.tsx` a
`app-form.spec.tsx`.
