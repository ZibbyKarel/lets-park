# 0021 – Focus trap modálu je ruční, ne nativní `<dialog>`

## Co

`Modal` je `<div role="dialog" aria-modal="true">` v portálu na `document.body`,
s vlastním `keydown` handlerem (`useFocusTrap`), který drží Tab uvnitř.
**Není** to `<dialog>` s `showModal()`, přestože nativní prvek by jinak byl
v této kódové základně první volba – `Input`, `Select`, `Checkbox` i `Radio` jsou
záměrně nativní prvky (`doc/decision/0012-*`).

## Proč

- **Nativní `<dialog>` by se nedal otestovat.** jsdom neimplementuje ani top
  layer, ani jeho zadržení focusu, a `user-event` si pořadí Tabu **počítá sám**
  přes celý dokument (ověřeno v dokumentaci `user-event`: handler pro Tab volá
  `getTabDestination` a `focusElement`). Testy, na kterých u modálu záleží –
  „Tab z posledního prvku se vrátí na první" a „Tab se nikdy nedostane na
  stránku za dialogem" – by proti nativnímu dialogu buď padaly, nebo (hůř)
  procházely, aniž by cokoli dokazovaly.
- **Vlastnost, kterou nelze ověřit, je vlastnost, kterou nemáme.** Tohle je na
  projektu potřetí, co se ukázalo, že deklarovaná ochrana byla ve skutečnosti
  nefunkční (dvakrát ESLint, jednou `tailwindcss` bez záznamu v `package.json`).
  U focus trapu je cena selhání vyšší než u nich: uživatel klávesnice
  „propadne" za dialog a neví, kde je.
- Ruční handler, který volá `preventDefault()` a posune focus explicitně, se
  chová **stejně v jsdomu i v prohlížeči**. Chování, které testy tvrdí, je tedy
  chování, které se opravdu nasadí.
- Nativní `<dialog>` navíc přináší vlastní `::backdrop`, který se nedá stylovat
  z tokenů stejně jako zbytek (je mimo kaskádu proměnných komponenty) a vlastní
  `close` event, který by se s řízeným `open`/`onClose` API dubloval.

## Jak

- `useFocusTrap({ active, containerRef, onEscape })`:
  - při aktivaci si zapamatuje `document.activeElement` a přesune focus na první
    tabbable prvek uvnitř (nebo na kontejner s `tabIndex={-1}`, když uvnitř
    žádný není),
  - na `keydown` Tab / Shift+Tab zabalí cyklus na hranici kontejneru **a** na
    prvním/posledním prvku (dvojitá pojistka: kdyby focus skončil mimo, další
    Tab ho vtáhne zpět),
  - na Escape zavolá `onEscape`,
  - při deaktivaci vrátí focus na zapamatovaný prvek – ale jen když ho overlay
    ještě drží (včetně `document.body`, kam prohlížeč focus odloží, když se
    fokusovaný prvek odstraní; kontrola jen přes `contains()` by focus nevrátila
    prakticky nikdy).
- `onEscape` je držené v ref, ne v dependency array. Volající skoro vždy předá
  inline arrow funkci; závislost na ní by trap přestavovala při každém renderu a
  přestavení znovu spouští úvodní `focus()` – tedy by vyhazovalo kurzor z pole,
  do kterého uživatel zrovna píše.
- „Obsah za dialogem je inert" je vědomě řešené trojicí `aria-modal="true"` +
  trap + krycí scrim, ne mutací sousedních DOM uzlů. Primitiv ten DOM nevlastní
  a úklid takového side effectu není spolehlivý; `inert` na sourozencích je věc
  layoutu aplikace.

### Ověření

Trap byl ověřen mutací, ne čtením: dočasné vyřazení větve pro Tab shodilo
3 testy (`cycles Tab…`, `cycles Shift+Tab…`, `takes focus itself when it
contains no controls at all`). Při té příležitosti se ukázalo, že jeden test
(„vtáhne focus zpět") procházel i s vypnutým trapem – portál je na konci
`<body>`, takže dopředný Tab do dialogu spadne sám. Test byl přepsán na
Shift+Tab, což je směr, který bez trapu uteče.

## Riziko

- **Ruční trap nezná top layer.** Kdyby nad modálem někdo vykreslil další
  overlay mimo jeho DOM podstrom, trap o něm neví. Řešením je vnořený `Modal`,
  který si vytvoří vlastní trap; víc než dvě úrovně MVP nepotřebuje.
- **Seznam fokusovatelných selektorů je ruční** (`FOCUSABLE_SELECTOR`). Prvek
  s `contenteditable` nebo custom element s `tabindex` v něm nejsou. Pro
  primitivy v této libce to stačí; kdyby přibyl editor, seznam se musí rozšířit.
- **Kdyby jsdom někdy top layer doplnil**, stojí za to rozhodnutí přehodnotit –
  nativní `<dialog>` by ubral kód. Do té doby je tohle jediná varianta, u které
  test znamená to, co tvrdí.
