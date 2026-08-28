# 0022 – Klávesová navigace Dropdownu a Tabs

## Co

Obě komponenty jedou na **roving tabindex** (v tab orderu stránky je vždy právě
jeden prvek widgetu) a mají tři konkrétní rozhodnutí, která ARIA nechává na
implementaci:

| rozhodnutí | Dropdown | Tabs |
| --- | --- | --- |
| aktivace | Enter / mezerník vybere | **automatická** – šipka vybere rovnou |
| type-ahead (psaní písmen) | **není** | není (ARIA ho pro taby nezná) |
| co dělá Tab | zavře menu a skočí za trigger | z pásu do panelu |
| zabalení na koncích | ano | ano |
| osa šipek | ↑ ↓ | ← → (↑ ↓ nechány stránce) |

## Proč

- **Roving tabindex, ne N zastávek.** Menu i tab pás jsou podle ARIA *jeden*
  složený widget, ne seznam samostatných tlačítek. Kdyby byla tabbable každá
  položka, uživatel klávesnice by musel devíti Taby prošlapat tab pás, aby se
  dostal k obsahu.
- **Tabs: automatická aktivace.** ARIA ji doporučuje, kdykoli je zobrazení
  panelu levné – tady je, obsah panelů už v stránce je. Šetří to jeden stisk na
  každý tab. (Manuální aktivace se hodí, když panel něco načítá; kdyby k tomu
  došlo, je to změna v `moveTo`.)
- **Dropdown: žádný type-ahead.** ARIA ho u menu uvádí jako volitelný. Menu
  v designu má tři položky – na třech položkách ho nikdo neobjeví, ale i tak by
  spolykal každou tisknutelnou klávesu. Vynechání je tedy čistý zisk; kdyby menu
  někdy narostlo, doplní se.
- **Tabs: ↑ ↓ zůstávají stránce.** Vodorovný tab pás má osu ← →. Kdyby si
  zabral i svislé šipky, uživatel by na fokusovaném tabu nemohl scrollovat.
- **Tab z menu se počítá od triggeru, ne od položky.** Prohlížeč by si cíl
  spočítal z položky menu, kterou ten samý handler zrovna odpojuje z DOM.
  Explicitní posun od pozice **triggeru** je jednak to, co uživatel čeká,
  jednak jediná varianta, která se chová stejně před i po překreslení Reactu.
  (Tohle není teorie – původní verze, která jen zavolala `close()`, na tomhle
  testu spadla.)

## Jak

- **Dropdown** (`dropdown.tsx`): trigger nese `aria-haspopup="menu"`,
  `aria-expanded` a `aria-controls`; panel je `role="menu"`, položky
  `role="menuitem"` s `tabIndex` 0 jen na aktivní. `ArrowDown` na triggeru
  otevře na první položce, `ArrowUp` na poslední. Uvnitř: šipky se zabalením,
  Home/End, Escape zavře a vrátí focus na trigger, klik mimo zavře.
  Zakázané položky se přeskakují (`enabledIndexes`) a nejdou vybrat.
  `useEffect` na `activeIndex` posouvá **skutečný DOM focus**, ne jen atribut –
  jinak by šipky pro odečítač obrazovky neznamenaly nic.
- **Tabs** (`tabs.tsx`): `role="tablist"` / `tab` / `tabpanel`, `aria-selected`
  na všech tabech (i `false`, ne vynechané), `aria-controls` a `aria-labelledby`
  svazují tab s panelem oběma směry. Panel má `tabIndex={0}`, aby se do něj dalo
  Tabem dostat i když v něm nic fokusovatelného není.
- Menu ani tab pás **není portál** (na rozdíl od `Modal`): panel se umisťuje
  vůči triggeru a držení ve stejném podstromu je to, co dělá „klik mimo zavře"
  a vnoření do modálu bez počítání souřadnic.

## Riziko

- **Automatická aktivace u Tabs je nevhodná pro drahé panely.** Kdyby panel
  něco načítal ze sítě, projetí šipkou přes pět tabů spustí pět requestů.
  Změna je lokální v `moveTo` (rozdělit focus a select).
- **Chybějící type-ahead** se pozná až na dlouhém menu. Do té doby je to úspora.
- **Roving tabindex u Tabs znamená, že vybraný tab je i jediný tabbable.**
  Když je vybraný tab `disabled` (což API dovolí přes `value`), pás nemá v tab
  orderu nic. `defaultValue` se proto počítá z prvního **povoleného** tabu; u
  řízeného režimu je to odpovědnost volajícího.
- **`aria-selected` na `disabled` tabu zůstává `false`**, ale prvek je pořád
  v `role="tab"`. Odečítač ho tedy ohlásí jako nedostupný tab, ne jako
  neexistující – což je záměr.
