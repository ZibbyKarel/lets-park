# Vizuální design – zdroj pravdy (staženo lokálně)

Odkaz z `plan.md` (§"Vizuální design – zdroj pravdy") byl **úspěšně otevřen** (Playwright,
přihlášená claude.ai session) a kompletně stažen sem, aby ho mohli číst i subagenti bez
přístupu k prohlížeči.

| Soubor | Co to je |
| --- | --- |
| `lets-park-design.dc.html` | Kompletní zdroj designu (Claude Design `.dc.html`). **Závazný zdroj pravdy pro vizuál.** Obsahuje všechny obrazovky, stavy a modály jako inline-stylovaný markup + `DCLogic` třídu s ukázkovými daty. |
| `ds/colors_and_type.css` | „Shoptet Design System — Foundations": barvy, typografie, spacing, radius, stíny, motion, layout jako CSS custom properties. **Toto je zdroj pravdy pro `libs/design-system/tokens`.** |
| `ds/fonts/*.otf` | Neue Haas Grotesk Display Pro (8 řezů) použité designem. |
| `ds/support.js` | Runtime Claude Design (jen pro referenci, do produktu se nekopíruje). |
| `screens/*.png` | Snímky jednotlivých obrazovek a stavů (viz tabulka níže). |

## Snímky obrazovek

| Soubor | Obrazovka / stav |
| --- | --- |
| `screens/canvas-default.png` | Login (nepřihlášený stav) – logo, claim, tlačítko „Login přes OKTA Verify" |
| `screens/07-lot.png`, `01-lot-admin.png` | Přehled parkoviště – role `admin` |
| `screens/12-lot-user.png`, `13-lot-user-bottom.png` | Přehled parkoviště – role `user` |
| `screens/02-avatar-menu.png` | Dropdown pod avatarem (Nastavení / Správa / Odhlásit) |
| `screens/08-modal-reserve.png` | Modal „Rezervovat místo" |
| `screens/09-modal-queue.png` | Modal „Přidat se do fronty" (držitel + pořadí ve frontě) |
| `screens/10-modal-bulk.png` | Modal „Hromadná rezervace" |
| `screens/11-settings.png` | Modal „Nastavení" (SPZ + preferované místo) |
| `screens/03-admin-users.png` | Administrace → Uživatelé |
| `screens/04-admin-spots.png` | Administrace → Parkovací místa |
| `screens/05-admin-window.png` | Administrace → Rezervační okno |
| `screens/06-admin-overview.png` | Administrace → Přehled parkoviště |
| `screens/14-lot-user-lockstate-off.png` | Parkoviště bez banneru stavu rezervačního okna |

## Klíčové hodnoty z designu (proti fallback popisu v `plan.md`)

`plan.md` uvádí jako fallback firemní akcenty `#fcaf00` / `#00e25a` / `#3b88ff`. Skutečný
design používá **Shoptet DS paletu**; tyto tři barvy se v něm objevují jen jako historické
varianty. Závazné jsou hodnoty z `ds/colors_and_type.css`:

- primární modrá `#008FFF` (hover `#0070D6`), zelená `#00DB33`, žlutá `#FFBE0E`,
  světle modrá `#E2F2FF`, tmavá `#23221F`, text `#15181E`, danger `#E5484D`
- neutrály `#FFFFFF … #23221F` (škála 0–950)
- font `NHaasGroteskDS` (fallback Neue Haas Grotesk / Helvetica Neue / Inter / Arial)
- spacing 4px base (`--space-1` … `--space-32`), radius `2/8/12/16/24/32/360px`
- stíny `--shadow-xs … --shadow-lg` + `--shadow-blue` / `--shadow-yellow`

Barvy aut na parkovišti (modrá/zelená/žlutá varianta) vycházejí z brand palety, ne
z fallback hodnot v `plan.md`.

## Pozn. k fontům

`.otf` soubory jsou staženy pro věrnost designu. Před nasazením do produkce ověř licenci
Neue Haas Grotesk Display Pro. `libs/design-system/tokens` musí mít funkční fallback stack,
aby aplikace bez těchto souborů vypadala rozumně.
