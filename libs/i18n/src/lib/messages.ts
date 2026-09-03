/**
 * The single Czech message catalog for the whole UI (see `doc/i18n.md`).
 *
 * Shaped the way next-intl expects a `Messages` object: a plain, JSON-like
 * object of strings grouped into namespaces. It is consumed two ways —
 * through `NextIntlClientProvider`/`getRequestConfig` inside React (see
 * `./provider.tsx` and `./request-config.ts`), and through `createTranslator`
 * outside React (see `translateErrorCode` in `./errors.ts`) — but there is
 * only ever this one object behind both, so the two paths can never disagree.
 *
 * The `errors` namespace came first, because translating the contract's closed
 * error-code enum was Task 17's whole remit (`doc/decision/0003-*`). Task 23
 * added `shell`, `login` and `nav` for the application shell. Add further
 * namespaces here — never a second catalog — when feature code needs more
 * translated UI copy.
 *
 * **Apostrophes.** next-intl parses these strings as ICU MessageFormat, where a
 * straight `'` is the escape character. Every apostrophe below is the
 * typographic `’` (U+2019), which ICU never treats as syntax — and which is
 * also what the design draws.
 */

import type { ErrorCode } from '@lets-park/contract';

/**
 * One Czech sentence per contract error code, written for a user rather than
 * a developer (the contract's own `message` field stays English and
 * developer-facing — see `libs/contract/src/api/errors.ts`).
 *
 * `OUT_OF_HORIZON` and `RESERVATIONS_LOCKED` are worded to read as different
 * situations on purpose: the first says the window has not opened *yet*, the
 * second says it has already closed. Collapsing them to the same sentence
 * would defeat the reason the contract has two codes at all.
 */
export interface CzechErrorMessages extends Record<ErrorCode, string> {
  readonly SPOT_ALREADY_RESERVED: string;
  readonly RESERVATION_LIMIT_REACHED: string;
  readonly PAST_DATE: string;
  readonly OUT_OF_HORIZON: string;
  readonly NOT_FOUND: string;
  readonly FORBIDDEN: string;
  readonly ALREADY_IN_WAITLIST: string;
  readonly CANNOT_WAITLIST_OWN_SPOT: string;
  readonly SPOT_NOT_OCCUPIED: string;
  readonly VALIDATION_FAILED: string;
  readonly CONFLICT: string;
  readonly RESERVATIONS_LOCKED: string;
}

/**
 * Copy that belongs to the application shell rather than to any one screen:
 * the loading, empty and error states every screen composes (Task 23,
 * `doc/frontend.md`).
 */
export interface CzechShellMessages {
  /** The product name. Rendered next to the logo mark in the top bar. */
  readonly brand: string;
  /** Accessible/visible label of the page-level loading indicator. */
  readonly loading: string;
  /** Heading of the generic failure state. */
  readonly errorTitle: string;
  /**
   * Body of the failure state when the failure is **not** one of the
   * contract's error codes — a dropped connection, a 500, a bug. Those that
   * are get their own sentence from the `errors` namespace instead.
   */
  readonly errorUnknown: string;
  /** Label of the button that re-runs whatever failed. */
  readonly retry: string;
  /** Title of the 404 page. */
  readonly notFoundTitle: string;
  readonly notFoundDescription: string;
  /** Link back to the parking overview, from the 404 page. */
  readonly backToLot: string;
  /** Placeholder body for a route whose screen is not built yet. */
  readonly comingSoon: string;
}

export interface CzechLoginMessages {
  /** First line under the logo. */
  readonly tagline: string;
  /** Second line under the logo. */
  readonly taglineSecondary: string;
  /** The one button on the page. */
  readonly signIn: string;
  /** Small-caps footnote at the bottom of the login screen. */
  readonly footnote: string;
}

/** Top bar and the avatar menu (`doc/design/screens/02-avatar-menu.png`). */
export interface CzechNavMessages {
  /** Accessible name of the avatar menu's trigger. */
  readonly userMenu: string;
  /** The `ADMIN` pill shown next to the avatar for an administrator. */
  readonly adminBadge: string;
  readonly settings: string;
  readonly administration: string;
  readonly signOut: string;
}

/**
 * The name of each top-level screen, used as its `<h1>` and by whatever links
 * to it. One key per route in `apps/web/src/routes.ts`.
 */
export interface CzechSectionMessages {
  /** `/` — the parking overview. */
  readonly lot: string;
  /** `/nastaveni` — the caller's own settings. */
  readonly settings: string;
  /** `/sprava` — administration. */
  readonly administration: string;
}

/**
 * The `/nastaveni` screen: licence plate, preferred spot, and the ICS feed
 * section (Task 26, `doc/design/screens/11-settings.png`).
 *
 * The ICS strings have no design to copy from — `doc/decision/0151-*` records
 * why the section exists at all — so they are original copy, written in the
 * same register as the rest of the shell (`errorUnknown`, `comingSoon`): short,
 * plain sentences aimed at the person reading them, not at a developer.
 */
export interface CzechSettingsMessages {
  /** Modal title. */
  readonly title: string;
  /** Modal description, verbatim from the design. */
  readonly description: string;
  readonly licensePlateLabel: string;
  readonly licensePlateTooLong: string;
  readonly preferredSpotLabel: string;
  /** The select's empty option — clearing the preferred spot is allowed. */
  readonly preferredSpotNone: string;
  /** Shown under the picker while `spot.list` is still in flight. */
  readonly preferredSpotLoading: string;
  /** Shown instead of a silent, options-less picker when `spot.list` fails. */
  readonly preferredSpotLoadError: string;
  readonly cancel: string;
  readonly save: string;
  readonly icsHeading: string;
  readonly icsDescription: string;
  readonly icsUrlLabel: string;
  readonly icsCopy: string;
  readonly icsCopied: string;
  readonly icsCopyFailed: string;
  readonly icsRegenerate: string;
  readonly icsRegenerateConfirmTitle: string;
  readonly icsRegenerateConfirmDescription: string;
  readonly icsRegenerateConfirmButton: string;
  /** Shown instead of the URL while the API origin cannot be derived. */
  readonly icsUnavailable: string;
  /**
   * `me.updateSettings`'s only reachable `VALIDATION_FAILED` on this screen:
   * the stored preferred spot has since been retired
   * (`MeService.requireSelectableSpot`). Shown instead of the shared error
   * catalogue's `VALIDATION_FAILED` sentence, which talks about weekends and
   * public holidays — a reservation-flow concept this screen never touches.
   */
  readonly preferredSpotUnavailable: string;
}

export interface CzechMessages {
  readonly errors: CzechErrorMessages;
  readonly shell: CzechShellMessages;
  readonly login: CzechLoginMessages;
  readonly nav: CzechNavMessages;
  readonly sections: CzechSectionMessages;
  readonly settings: CzechSettingsMessages;
}

export const csMessages: CzechMessages = {
  shell: {
    brand: 'Let’s Park',
    loading: 'Načítá se…',
    errorTitle: 'Něco se nepovedlo',
    errorUnknown: 'Zkuste to prosím znovu za chvíli.',
    retry: 'Zkusit znovu',
    notFoundTitle: 'Stránka nenalezena',
    notFoundDescription: 'Odkaz, který jste otevřeli, nikam nevede.',
    backToLot: 'Zpět na parkoviště',
    comingSoon: 'Tato část se právě připravuje.',
  },
  login: {
    tagline: 'Rezervace firemních parkovacích míst.',
    taglineSecondary: 'Přihlaste se firemním účtem.',
    signIn: 'Login přes OKTA Verify',
    footnote: 'Interní nástroj · pouze pro zaměstnance',
  },
  nav: {
    userMenu: 'Uživatelské menu',
    adminBadge: 'Admin',
    settings: 'Nastavení (SPZ auta)',
    administration: 'Správa',
    signOut: 'Odhlásit se',
  },
  sections: {
    lot: 'Přehled parkoviště',
    settings: 'Nastavení',
    administration: 'Správa',
  },
  settings: {
    title: 'Nastavení',
    description:
      'SPZ se předplní při každé rezervaci místa. Preferované místo použijeme přednostně u hromadné rezervace.',
    licensePlateLabel: 'SPZ auta',
    licensePlateTooLong: 'Nejvýše 16 znaků.',
    preferredSpotLabel: 'Preferované parkovací místo',
    preferredSpotNone: 'Bez preference',
    preferredSpotLoading: 'Načítá se seznam parkovacích míst…',
    preferredSpotLoadError: 'Seznam parkovacích míst se nepodařilo načíst. Zkuste to prosím znovu.',
    cancel: 'Zrušit',
    save: 'Uložit',
    icsHeading: 'Odběr kalendáře (ICS)',
    icsDescription:
      'Své rezervace si můžete přidat do kalendáře (Outlook, Google Calendar) přes tento odkaz. Kdokoliv odkaz zná, uvidí vaše rezervace — nesdílejte ho.',
    icsUrlLabel: 'Odkaz na kalendář',
    icsCopy: 'Kopírovat odkaz',
    icsCopied: 'Odkaz zkopírován do schránky.',
    icsCopyFailed: 'Kopírování se nezdařilo — zkopírujte odkaz ručně.',
    icsRegenerate: 'Vygenerovat nový odkaz',
    icsRegenerateConfirmTitle: 'Vygenerovat nový odkaz?',
    icsRegenerateConfirmDescription:
      'Starý odkaz přestane fungovat a kalendáře, které ho používají, se přestanou aktualizovat. Budete ho muset všude nahradit novým.',
    icsRegenerateConfirmButton: 'Vygenerovat',
    icsUnavailable: 'Odkaz na kalendář teď není k dispozici. Zkuste to prosím znovu za chvíli.',
    preferredSpotUnavailable:
      'Preferované místo už není k dispozici. Zvolte prosím jiné, nebo možnost Bez preference.',
  },
  errors: {
    SPOT_ALREADY_RESERVED: 'Toto parkovací místo je na daný den už rezervované.',
    RESERVATION_LIMIT_REACHED: 'Na tento den už máte rezervaci — na den je povolená jen jedna.',
    PAST_DATE: 'Na tento den už nelze rezervovat, protože je v minulosti.',
    OUT_OF_HORIZON: 'Rezervace na tento měsíc se ještě neotevřely.',
    RESERVATIONS_LOCKED: 'Rezervační okno pro tento měsíc je už uzamčené.',
    NOT_FOUND: 'Požadovaný záznam nebyl nalezen.',
    FORBIDDEN: 'K této akci nemáte oprávnění.',
    ALREADY_IN_WAITLIST: 'Na toto místo a den už čekáte ve frontě.',
    CANNOT_WAITLIST_OWN_SPOT: 'Na vlastní rezervované místo se nelze zařadit do fronty.',
    SPOT_NOT_OCCUPIED: 'Toto místo je volné — místo čekání ve frontě si ho rovnou rezervujte.',
    VALIDATION_FAILED: 'Požadavek porušuje pravidlo rezervací (např. víkend nebo svátek).',
    CONFLICT: 'Někdo jiný mezitím provedl stejnou změnu — zkuste to prosím znovu.',
  },
};
