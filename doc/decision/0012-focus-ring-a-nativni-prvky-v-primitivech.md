# 0012 – Focus ring navíc proti designu a nativní prvky v primitivech

## Co

Dvě přístupová rozhodnutí pro vrstvu `libs/design-system/primitives`:

1. **Každý fokusovatelný primitiv dostal jednotný focus ring** –
   `outline: 2px var(--brand-blue)` s `outline-offset` 2px, přes
   `:focus-visible`. Design ho nepředepisuje.
2. **Input, Select, Checkbox a Radio jsou nativní HTML prvky**, jen
   přestylované (`appearance-none` + tokeny). Žádný z nich není `div`
   s `role=""`. Switch je `<button role="switch">`, Stepper je dvojice
   `<button>` plus hodnota s `role="spinbutton"`.

## Proč

**K bodu 1.** Design (`doc/design/lets-park-design.dc.html`) definuje
`style-focus` **jen u textových polí a selectů**, a to jako změnu barvy rámečku
na `#008FFF`. U tlačítek, přepínačů a stepperu nedefinuje fokus vůbec – protože
je psaný inline styly pro statickou ukázku, ne jako produkční CSS.

Převzít to doslova by znamenalo:

- tlačítka bez jakéhokoli viditelného fokusu (prohlížeč by nakreslil default,
  který se s pill tvarem a barvami designu tluče),
- u polí by jediným signálem fokusu byla změna barvy 1px rámečku, což je málo
  kontrastní na to, aby to byl jediný indikátor.

Dostupnost z klávesnice je u tohohle úkolu funkční požadavek, ne kosmetika, a
neviditelný fokus ji rozbíjí. Ring je proto **doplněk, ne náhrada** – u polí
zůstává i modrý rámeček z designu.

**K bodu 2.** Vlastní listbox / checkbox / radio z `div`ů by musel
znovu naimplementovat type-ahead, Home/End, Alt+šipky, roving tabindex mezi
radiy, mobilní picker, `:checked`, odesílání formuláře a celý kontrakt pro
odečítače obrazovky. To je přesně to místo, kde v design systémech vznikají
chyby v přístupnosti. Nativní prvek to všechno má a design sám používá
`<select>` a `<input>`, takže není ani vizuální důvod je opouštět.

## Jak

- `control-size.ts` exportuje `FOCUS_RING` jako jednu konstantu, kterou
  používají všechny primitivy – nejde ho někde zapomenout ani mít jinak.
- Vizuální chrome se řeší `appearance-none` a překreslením: u Selectu je šipka
  `aria-hidden` SVG, u Checkboxu je fajfka `aria-hidden` SVG nad `peer`
  inputem, u Radia vnitřní tečka. **Prvek, který drží chování, je vždycky ten
  nativní**, ne jeho grafický sourozenec.
- Stav „neplatné" nese `aria-invalid` na tom prvku, který ho podporuje. U Radia
  ho `role="radio"` nepodporuje, takže ho drží skupina (`RadioGroup`,
  `<fieldset>`), ne jednotlivá volba.
- U Switche je `disabled` řešené barvou z tokenů (`--border`), ne `opacity`,
  aby stav zůstal popsaný tokenem.
- Testy (Jest + Testing Library) u každé komponenty ověřují `role`, přístupné
  jméno, dosažitelnost Tabem a ovládání klávesnicí – ne vzhled.

## Riziko

- **Odchylka od vizuálního zadání.** Ring je viditelný prvek, který v designu
  není. Kdyby ho designér chtěl jinak (jiná barva, `box-shadow` místo
  `outline`), je to změna jedné konstanty.
- **`role="spinbutton"` u Stepperu je nad rámec designu**, kde je hodnota jen
  needitovatelný box. Přidává hodnotu do pořadí tabů. Bez toho by ale šla
  hodnota měnit výhradně dvěma tlačítky a šipky by nedělaly nic.
- **jsdom neumí klávesovou obsluhu nativního `<select>`u.** Test proto ověřuje,
  že prvek zůstal `<select>` (tj. že chování dodává platforma), ne že šipka
  posune výběr – to je tvrzení, které umí ověřit až e2e v prohlížeči (Fáze 7).
