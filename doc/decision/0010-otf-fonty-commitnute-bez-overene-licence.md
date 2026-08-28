# 0010 – `.otf` fonty jsou commitnuté i bez ověřené licence, s povinným fallbackem

**Datum:** 2026-08-28 · **Stav:** přijato (dočasně) · **Riziko:** licence

## Co

8 řezů `NHaasGroteskDSPro-*.otf` je zkopírováno z `doc/design/ds/fonts/` do
`libs/design-system/tokens/assets/fonts/` a jsou v gitu. `FONT_FACES` v
`typography.ts` je používá pro `@font-face` v generovaném `tokens.css`.
`FONT_FAMILIES.sans` má za `NHaasGroteskDS` funkční fallback stack (`Neue Haas
Grotesk, Helvetica Neue, Inter, Arial, system-ui, sans-serif`).

**Vedlejší zjištění:** `colors_and_type.css` deklaruje 9 `@font-face` pravidel
(mj. weight 700 italic, soubor `NHaasGroteskDSPro-76BdIt.otf`), ale
`doc/design/ds/fonts/` obsahuje jen 8 souborů – tenhle řez nebyl vyexportován
(`doc/design/README.md` sám píše „8 řezů"). `FONT_FACES` proto **vynechává**
záznam pro weight 700 italic (komentář v `typography.ts` vysvětluje proč) –
jinak by `@font-face` odkazoval na neexistující soubor a v prohlížeči by jen
tiše 404oval. Bold italic text se stále vykreslí (prohlížeč syntetizuje italiku
z weight 700 normal), jen to není skutečný nakreslený řez. Test
`generate-css.spec.ts` („every declared font face file actually exists“) hlídá,
že se `FONT_FACES` a skutečně přítomné soubory v `assets/fonts/` znovu
nerozejdou.

## Proč

`doc/design/README.md` výslovně upozorňuje: „Před nasazením do produkce ověř
licenci Neue Haas Grotesk Display Pro.“ Nemám prostředky ověřit licenci v rámci
tohoto úkolu (vyžaduje nákup/kontrolu smlouvy, kterou nemá agent k dispozici) a
zadání Tasku 6 přesto žádá „`@font-face` deklarace pro NHaasGroteskDS s fallback
stackem; fonty zkopíruj z `doc/design/ds/fonts/` do assetů lib“ – tedy fonty
commitnout, ne řešení licence blokovat celý task.

## Jak

- Fonty jsou v `assets/fonts/*.otf`, `@font-face` bloky generované z `FONT_FACES`.
- `FONT_FAMILIES.sans` fallback zajišťuje, že appka vypadá rozumně i bez těchto
  souborů (např. v prostředí, které by je z licenčních důvodů muselo vynechat).
- Toto rozhodnutí je „dočasné“: než se licence ověří, fonty zůstávají jen pro
  věrnost designu ve vývoji.

## Riziko, když je to špatně

Pokud se ukáže, že Neue Haas Grotesk Display Pro nejde nasadit do produkce beze
smlouvy: (1) smazat `assets/fonts/*.otf` a `@font-face` blok z generátoru,
(2) `FONT_FAMILIES.sans` beze změny funguje na fallbacku, (3) žádný jiný token ani
konzument (primitives/compounds) na fyzické přítomnosti `.otf` souborů nezávisí –
jen na `--font-sans`. Dopad je tedy vizuální (jiný font), ne funkční.
