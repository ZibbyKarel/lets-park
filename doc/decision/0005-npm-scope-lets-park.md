# 0005 – NPM scope je `@lets-park`, ne `@myorg`

**Datum:** 2026-08-28 · **Stav:** přijato (rozhodl uživatel) · **Mění:** `plan.md` (názvy entry pointů)

## Co

Všechny libs v workspace žijí pod scope `@lets-park`:

| `plan.md` píše | Skutečnost |
| --- | --- |
| `@myorg/contract` | `@lets-park/contract` |
| `@myorg/contract/realtime` | `@lets-park/contract/realtime` |
| `@myorg/design-system/primitives` | `@lets-park/design-system/primitives` |
| … | … |

## Proč

`@myorg` je zjevný placeholder. Změna scope se dotýká každého importu v repu, takže je
prakticky zdarma teď (před vznikem první lib) a drahá později. Uživatel volbu potvrdil.

## Jak

Scope se nastavuje v Tasku 1 (root `package.json`, `nx.json`, path aliasy
v `tsconfig.base.json` a defaulty generátorů), aby každá lib vzniklá v dalších úkolech
spadla pod `@lets-park/*` automaticky.

## Riziko, když je to špatně

Přejmenování scope je mechanické (search & replace + regenerace path aliasů), ale čím
později, tím víc souborů. Proto to řešíme hned v Tasku 1.
