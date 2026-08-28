# Wrapper vrstvy

Task 18 z `doc/implementation-plan.md` (`libs/form`), první ze série 18–22, která postupně
zakládá zbytek `WRAPPED_LIBRARIES` (`libs/query`, `libs/api-client`, `libs/realtime-client`,
`libs/auth`). Tenhle dokument se zakládá teď a **doplňují ho další úkoly** — každý wrapper
sem přidá vlastní sekci, ne nový soubor.

## Co je wrapper lib a proč je povinná

`plan.md` a `doc/workspace.md` (sekce „Wrapper vrstvy") zakazují aplikačnímu i knihovnímu
kódu importovat určité třetí strany přímo. Pro každou z nich existuje přesně jedna
**wrapper lib** — jediné místo v celém workspace, které ji smí importovat:

| zakázaný balíček | wrapper lib | tag |
| --- | --- | --- |
| `react-hook-form` | `libs/form` (`@lets-park/form`) | `type:util`, `scope:web` |
| `@tanstack/react-table` | `libs/design-system/compounds` | `type:ui`, `scope:web`, `ds:compounds` |
| `@tanstack/react-query` | `libs/query` | `type:util`, `scope:web` |
| `@orpc/client` | `libs/api-client` | `type:util`, `scope:web` |
| `socket.io-client` | `libs/realtime-client` | `type:util`, `scope:web` |
| `next-auth` | `libs/auth` | `type:util`, `scope:web` |
| `ical-generator` | `libs/calendar-export` | `type:util`, `scope:api` |
| `next-intl` | `libs/i18n` (hotovo, Task 17) | `type:util`, `scope:web` |

Důvod zákazu není „ušetřit pár znaků importu" ale tři konkrétní věci, které přímý import
kdekoliv jinde rozbíjí:

1. **Verze a chování třetí strany jsou zaměnitelné až na jednom místě.** Kdyby `apps/web`
   volalo `react-hook-form` přímo na deseti místech, upgrade major verze nebo výměna za jinou
   knihovnu (`libs/form` interně na `@hookform/resolvers`) by znamenala deset míst k opravě
   místo jednoho.
2. **Kontrakt zůstává jediným zdrojem pravdy pro tvar dat.** Wrapper je most mezi Zod
   schématem (`libs/contract`) a zbytkem stacku — `libs/form` bere Zod schéma a validuje
   proti němu, `libs/api-client` bude brát oRPC kontrakt. Přímý import knihovny by tenhle
   most obešel a otevřel cestu k ručně psané validaci, která se s kontraktem časem rozejde.
3. **Hranice se dá vynutit strojově, ne jen review.** `eslint.config.mjs` (`no-restricted-
   imports` + `@nx/enforce-module-boundaries`) to hlídá při každém běhu `npm run lint`
   (`--max-warnings=0`) — recenzent nemusí pamatovat pravidlo, spadne build.

## Jak je zákaz vynucený

Jedna mapa, `WRAPPED_LIBRARIES` v `eslint.config.mjs`, je jediný zdroj pravdy pro dvojici
(zakázaný balíček → vlastnící adresář). Z ní se generují:

- **globální zákaz** (`no-restricted-imports` na `apps/**` a `libs/**`) — pro každý balíček
  z mapy jeden vzor s chybovou hláškou, která rovnou řekne, jaký wrapper použít místo něj;
- **výjimka pro vlastníka** (`wrapperLibOverrides`) — stejné pravidlo, ale s balíčkem
  vlastníka odečteným ze zakázaného seznamu, aplikovaná jen na `<owner>/**`.

Tahle jedna mapa je i důvod, proč `doc/workspace.md` varuje před „tiše nic nedělá": obě
pravidla (zákaz i výjimka) čerpají ze stejných dat, takže se nemůžou rozejít, ale
**`basePath: workspaceRoot`** je pořád nutný na obou — Nx spouští `eslint .` s cwd
nastaveným na adresář projektu, takže workspace-relativní glob (`libs/form/**`) beze
`basePath` porovnává špatnou cestu a nikdy nesedne.

Kromě zákazu importu balíčku wrapper libs nese i Nx dimenzi `type:util`, jejíž
`allowedExternalImports` je sjednocení všech balíčků z `WRAPPED_LIBRARIES` plus jejich
React/Next peer-dependencies (`doc/workspace.md`) — **koho konkrétně smí importovat kdo**
(že `libs/form` smí jen `react-hook-form`, ne `next-auth`) hlídá až `no-restricted-imports`
override, protože Nx dimenze na tohle rozlišení nestačí (stejný tag nesou všechny wrapper
libs najednou).

### `libs/form` a design systém — proč to není další výjimka v týž mapě

`libs/form` je zvláštní v jedné věci: `FormField` má „spojovat" Zod chybu a design-systémový
primitiv (`Input`/`Select`/`Checkbox`), ale **neimportuje design systém** ve svém produkčním
kódu — dělá to jako obecný render-prop (`doc/decision/0030-*`). Skládání s konkrétním
primitivem dělá až volající (budoucí `apps/web`), stejně jako každou jinou kompozici design
systému. Jediné místo, kde `libs/form` design systém přesto potřebuje, je jeho vlastní
demonstrační test (`app-form.spec.tsx`) — a ten má vlastní, úzce zacílený ESLint override
(`doc/decision/0030-*`), ne rozšíření `WRAPPED_LIBRARIES`.

### Příklad použití

`FormField` je obecný render-prop (viz výše) — spojuje jedno pole (hodnotu, `onChange`,
`onBlur`, `ref`, resolvovanou Zod chybu) s primitivem, který zvolí volající. Pro `Input` a
`Select` stačí `{...field}` rozbalit přímo, protože jejich `value`/`onChange` odpovídají
tomu, co react-hook-form posílá. **`Checkbox` ne** — je to nativní `<input
type="checkbox">`, který stav nese přes `checked` (boolean), ne `value`, a jeho `onChange`
posílá event, jehož `target.checked` (ne `target.value`) je potřeba zpátky poslat do
`field.onChange`. Tohle je přesně to místo, kde render-prop design přenáší odpovědnost na
volajícího — a přesně to, co se dá při psaní nové domain formy nejsnáz zapomenout:

```tsx
import * as z from 'zod';
import { Checkbox, Input, Select } from '@lets-park/design-system-primitives';
import { FormField, FormProvider, useAppForm } from '@lets-park/form';

const bookingSchema = z.object({
  spotId: z.string().min(1, 'Choose a spot'),
  vehicleType: z.enum(['car', 'motorcycle']),
  recurring: z.boolean(),
});

function BookingForm() {
  const form = useAppForm({
    schema: bookingSchema,
    defaultValues: { spotId: '', vehicleType: 'car', recurring: false },
  });

  return (
    <FormProvider {...form}>
      <form onSubmit={form.handleSubmit((values) => submitBooking(values))}>
        {/* Input/Select: field shape already matches value/onChange, spread directly. */}
        <FormField
          name="spotId"
          render={({ field, error }) => <Input label="Parking spot" error={error} {...field} />}
        />
        <FormField
          name="vehicleType"
          render={({ field, error }) => (
            <Select label="Vehicle" error={error} {...field}>
              <option value="car">Car</option>
              <option value="motorcycle">Motorcycle</option>
            </Select>
          )}
        />

        {/* Checkbox adapter: checked (not value), and onChange must read
            event.target.checked back into field.onChange — a plain
            {...field} spread here would silently do nothing on click. */}
        <FormField
          name="recurring"
          render={({ field, error }) => (
            <Checkbox
              label="Repeat this reservation weekly"
              error={error}
              name={field.name}
              checked={field.value}
              onChange={(event) => field.onChange(event.target.checked)}
              onBlur={field.onBlur}
              ref={field.ref}
            />
          )}
        />

        <button type="submit">Reserve</button>
      </form>
    </FormProvider>
  );
}
```

Stejný vzor (i s testy nad `Checkbox`) je ověřený v `libs/form/src/lib/app-form.spec.tsx` —
tenhle příklad z něj přímo vychází, jen s parkovací doménou místo obecného demo schématu.

## Jak přidat další wrapper lib (Tasky 19–22)

1. **Vygeneruj lib** stejně jako každou jinou (`doc/workspace.md`, „Jak přidat novou lib").
   Tagy: `type:util`, `scope:web` (nebo `scope:api` pro `libs/calendar-export`).
2. **Přidej záznam do `WRAPPED_LIBRARIES`** v `eslint.config.mjs` — `owner` (adresář lib) a
   `use` (import path). Globální zákaz i výjimka pro nový wrapper vzniknou automaticky,
   nic dalšího psát nemusíš.
3. **Pokud balíček potřebuje vlastní pomocnou závislost** (jako `@hookform/resolvers` u
   `react-hook-form`), přidej ji zvlášť do `NPM_ALLOWLIST.util` — není součástí
   `WRAPPED_LIBRARIES`, protože sama o sobě nikoho nezastupuje, dává smysl jen v páru
   s wrapovaným balíčkem.
4. **Napiš tři typy testů** (jak to udělal Task 17 pro `next-intl` a Task 18 pro
   `react-hook-form`):
   - že se wrapper dá reálně použít (render/volání skrz veřejné API),
   - že chová se podle kontraktu/dat, která zabaluje (validace, formátování, ...),
   - že aplikační kód **nemusí** importovat zabalovanou knihovnu přímo, aby wrapper použil —
     ne jen že export existuje, ale reálný běžící příklad.
5. **Ověř zákaz i výjimku dočasnými probe soubory**, ne jen že `npm run lint` projde zeleně
   (`doc/workspace.md` – tahle past už nastala třikrát): jeden import zabaleného balíčku
   uvnitř nové lib (očekáváno: projde), jeden stejný import odjinud (očekáváno: spadne
   s hláškou, která pojmenuje správný wrapper). Probe soubory po ověření smaž.
6. `npm run lint && npm run typecheck && npm run test` + `npm run build`, přidej sekci sem.

## Testy `libs/form`

| soubor | co ověřuje |
| --- | --- |
| `use-app-form.spec.tsx` | `useAppForm` + `FormField` na holém `<input>`: Zod chyba se propíše do `role="alert"` a `aria-invalid`; validní submit zavolá handler s hodnotami po Zod parsování |
| `app-form.spec.tsx` | totéž na skutečných `Input`/`Select`/`Checkbox` z `@lets-park/design-system-primitives` — tři pole, tři různé primitivy, jedno Zod schéma; navíc test, který čte vlastní zdrojový soubor a ověřuje, že v něm není přímý import `react-hook-form` |

Zod v testech je vždy lokální `z.object(...)` schéma, ne import z `@lets-park/contract` —
`libs/form` je doménově nezávislé a `@orpc/contract` (ESM-only, viz `doc/decision/0020-*`)
by do jeho Jest configu přidalo transform, který tenhle task nepotřebuje. Žádná čtvrtá kopie
ESM-transform bloku (`doc/decision/0020-*`, `0025-*`) tedy v `libs/form/jest.config.cts`
není a nebyla potřeba.
