# 0023 – Toast a Tooltip jsou čistě prezentační

## Co

- **`Toast`** je jedno oznámení. Žádná fronta, žádný časovač, žádné imperativní
  API typu `toast.success(...)`. `ToastRegion` je jen pozicovací obal; seznam
  toastů dodává aplikace.
- **`Tooltip`** obaluje právě jeden fokusovatelný prvek a zapisuje mu
  `aria-describedby` **na něj samotný** (přes `cloneElement`), sloučeně s tím,
  co si tam volající případně dal sám.
- Ani jeden nemá v designu předlohu – oba jsou odvozené z jeho vizuálního
  jazyka, viz níže.

## Proč

- **Globální fronta toastů je stav aplikace, ne design systému.** Primitiv, který
  by vlastnil mutovatelnou singleton frontu, nejde vykreslit dvakrát na stránce
  ani otestovat izolovaně, a stáhl by do `libs/design-system` rozhodnutí (jak
  dlouho toast visí, kolik se jich stohuje, co se stane při navigaci), která
  patří featuře. Prezentační `Toast` + `ToastRegion` pokrývají vzhled a
  přístupnost; zbytek je pár řádků `useState` u volajícího.
- **Toast nesmí krást focus.** Celý smysl toastu je, že hlásí, zatímco uživatel
  dělá dál svoje. Ohlašuje se tedy živou oblastí, ne přesunem focusu:
  `role="status"` (zdvořilé – odečítač dořekne větu) pro všechny tóny kromě
  `danger`, který dostane `role="alert"` (naléhavé, přeruší), protože selhání,
  na které má uživatel reagovat, nemůže čekat na pauzu.
- **`ToastRegion` musí být v DOM dřív než zpráva.** Živá oblast, která se objeví
  už s textem uvnitř, se často nepřečte. Proto se `ToastRegion` renderuje
  bezpodmínečně a prázdný – a proto na to má test.
- **`aria-describedby` nemůže být na obalu.** Asistivní technologie čte popis
  z atributů **fokusovaného prvku**; `aria-describedby` o úroveň výš nepopisuje
  nic. Je to chyba, která při renderu nestojí nic a při použití všechno – proto
  `cloneElement` na dítě a test, který popis ověřuje přes
  `toHaveAccessibleDescription()` na tlačítku, ne přes existenci atributu.
- **Tooltip se otevírá i na focus, nejen na hover.** Tooltip jen na hover je pro
  klávesnici a dotyk neviditelný; to je nejčastější způsob, jak se tahle
  komponenta zkazí. Escape ho navíc schová bez přesunu focusu, aby si uživatel
  mohl odkrýt obsah pod ním.
- **Tooltip nikdy nedodá jméno.** Popis se čte *po* jméně prvku. Ovládací prvek,
  jehož jediné jméno by přišlo z tooltipu, potřebuje `aria-label` – jméno, které
  se objeví jen na hover, není jméno.

## Jak

- **Barvy toastu nejsou vymyšlené.** Design má vlastní tónovaný blok upozornění
  (`background:#FFF4D2; border:1px solid #FFBE0E`). `Toast` ho zobecňuje na
  „stotková výplň + plná barva jako rámeček" pro všech pět tónů. Každá položka
  `TONE_CLASSES` je **úplná dvojice** (pozadí i rámeček v jednom řetězci), aby
  prvek nikdy nenesl pozadí jednoho tónu přes rámeček druhého – stejný důvod
  jako u `disabled` stavů, viz `button.tsx`.
- Vymyšlené jsou jen rozměry: `--toast-w` (380px) a `--tooltip-max-w` (240px),
  obojí zaznamenané v `doc/decision/0020-*`. Tooltip jinak jede na
  `--bg-inverse` / `--fg-on-dark` / `--radius-xs` / `--shadow-md`, tedy na
  existující paletě.
- `ToastRegion` má `pointer-events-none` a vnitřní stoh `pointer-events-auto`:
  jinak by neviditelná oblast polykala kliky na to, co překrývá – chyba, která
  se projeví jen na místech, která nikdo netestuje.
- `ToastRegion` je `role="region"`, **ne** druhá živá oblast. Vnořené živé
  oblasti některé odečítače přečtou dvakrát.

## Riziko

- **Aplikace si musí frontu napsat sama** (a s ní auto-dismiss i limit počtu).
  Je to pár řádků, ale je to práce navíc a dva featurové týmy si ji můžou
  napsat každý jinak. Pokud se to začne opakovat, patří to do
  `libs/design-system/compounds` nebo do featurové libky – ne sem.
- **`Tooltip` vyžaduje právě jedno dítě, které umí přijmout props.** Fragment
  nebo textový uzel spadnou. Typ `ReactElement<DescribableChildProps>` to
  odchytí v TS, ne za běhu.
- **Tooltip nemá kolizní detekci.** Je umístěný čistě CSS (`top`/`bottom` +
  `left-1/2`), takže u kraje viewportu může přetéct. Pro popisky v tabulce a
  na tlačítkách to stačí; automatické překlápění by znamenalo měřit layout,
  což primitiv v této vrstvě dělat nemá.
- **`--toast-w` a `--tooltip-max-w` projdou až vizuálním review.**
