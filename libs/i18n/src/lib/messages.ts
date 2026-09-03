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
 * The parking-lot screen (Task 24) — `doc/design/screens/07-lot.png`,
 * `12-lot-user.png`, `08-modal-reserve.png`, `09-modal-queue.png`.
 *
 * Every string below is transcribed from `doc/design/lets-park-design.dc.html`
 * rather than written fresh, so the wording on screen is the wording the
 * design was signed off with. Three groups of keys have no design original and
 * say so on the key itself:
 *
 * - `bannerNotYetOpen*` — the design's `monthOpen()` is a boolean and only ever
 *   draws "open" or "locked", but the contract's `MonthLockState` has a third
 *   member the admin screen already labels "Zatím neotevřeno".
 * - `bannerOpenForced` / `bannerNotYetOpenForced` — the dated sentence is only
 *   true under `lockMode: 'AUTO'` (`monthWindowOverviewSchema`).
 * - `realtime*` — the `rejected` socket status has no design state.
 *
 * **Counts are not ICU-pluralised, deliberately.** The design writes
 * `freeCount + " volných"` flat, and `"{n} ve frontě"` / `"{free} z {total}
 * volných"` are idiomatic Czech at every count. Where the design *does*
 * decline (the admin screen's "1 den / 2 dny / 5 dní") that screen is Task 27's.
 */
export interface CzechLotMessages {
  /** `4 volných` — the green-dot pill in the header. */
  readonly freeCount: string;
  /** `5 obsazených` — the blue-dot pill next to it. */
  readonly takenCount: string;
  /** The header's primary action. The modal behind it is Task 31. */
  readonly bulkReservation: string;
  /** Shown when the bulk modal is asked for before Task 31 has built it. */
  readonly bulkComingSoon: string;

  /** `1 z 4 volných` — right-hand meta of a group's rule. */
  readonly groupFree: string;
  /** Accessible name of a group's region. */
  readonly groupLabel: string;

  /** Body of a free tile. */
  readonly free: string;
  /** Accessible name of a free tile's button. */
  readonly reserveSpotAction: string;
  /** Accessible name of an occupied tile's button. */
  readonly openSpotAction: string;
  /** First line of the `⊘` tile in a month this caller may not book. */
  readonly tileLocked: string;
  /** First line of a cell held by somebody else. */
  readonly tileEditing: string;
  /** The yellow waitlist pill on a tile. */
  readonly waiting: string;
  /** Accessible name of the `⋯` admin button on a tile. */
  readonly spotMenu: string;
  /** The single entry in that menu. */
  readonly spotMenuManage: string;
  /** Spoken form of a plate for assistive technology, and the modal's fallback. */
  readonly noPlate: string;

  readonly legendTaken: string;
  readonly legendFree: string;
  readonly legendWaitlist: string;

  /** `‹` / `›` / `Dnes` and the two selectors of the sticky day bar. */
  readonly previousDay: string;
  readonly nextDay: string;
  readonly today: string;
  readonly monthLabel: string;
  readonly yearLabel: string;
  /** Second line of the day bar on an ordinary day. */
  readonly workday: string;
  /** Second line on a public holiday: `STÁTNÍ SVÁTEK · Den české státnosti`. */
  readonly holiday: string;
  /** Second line on a Saturday or Sunday. */
  readonly weekend: string;

  /** Green banner, `lockMode: 'AUTO'` — carries the window's last day. */
  readonly bannerOpen: string;
  /** Green banner under `FORCE_OPEN`, where `windowTo` is hypothetical. */
  readonly bannerOpenForced: string;
  readonly bannerLockedAdmin: string;
  readonly bannerLockedUser: string;
  /** No design original — see the interface docs. */
  readonly bannerNotYetOpen: string;
  readonly bannerNotYetOpenForced: string;

  /** `Místo E2.92` — the modal's eyebrow pill. */
  readonly modalEyebrow: string;
  readonly titleReserve: string;
  readonly titleQueue: string;
  /**
   * The caller is **already** in this cell's queue. Distinct from
   * {@link titleQueue}: the design's prototype had no notion of queue
   * membership, so it offered only "join", and a browser run of the real
   * screen showed the modal headed "Přidat se do fronty" above a button
   * reading "Odejít z fronty".
   */
  readonly titleQueued: string;
  readonly titleMine: string;
  readonly titleEdit: string;
  readonly titleInfo: string;
  readonly subReserve: string;
  readonly subQueue: string;
  /** Pairs with {@link titleQueued}. */
  readonly subQueued: string;
  readonly subMine: string;
  readonly subMineLocked: string;
  readonly subInfo: string;
  readonly subAdmin: string;
  readonly subTaken: string;
  readonly ctaReserve: string;
  readonly ctaQueue: string;
  readonly cancelReservation: string;
  readonly close: string;
  readonly queueHeading: string;
  readonly queueEmpty: string;
  readonly occupiedBy: string;
  /** Shown to a caller who is already queued for the spot. */
  readonly queuePosition: string;
  readonly leaveQueue: string;
  readonly lockNote: string;

  /** The lot has no active spots at all. */
  readonly emptyTitle: string;
  readonly emptyDescription: string;

  /**
   * The socket's `rejected` status — terminal until somebody asks again
   * (`doc/decision/0061-*`). `realtimeReconnect` is the control that calls
   * `reconnect()`; without it the grid stops updating silently.
   */
  readonly realtimeRejected: string;
  readonly realtimeReconnect: string;
}

export interface CzechMessages {
  readonly errors: CzechErrorMessages;
  readonly shell: CzechShellMessages;
  readonly login: CzechLoginMessages;
  readonly nav: CzechNavMessages;
  readonly sections: CzechSectionMessages;
  readonly lot: CzechLotMessages;
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
  lot: {
    freeCount: '{count} volných',
    takenCount: '{count} obsazených',
    bulkReservation: 'Hromadná rezervace',
    bulkComingSoon: 'Hromadná rezervace se právě připravuje.',

    groupFree: '{free} z {total} volných',
    groupLabel: 'Skupina {group}',

    free: 'Volné',
    reserveSpotAction: 'Rezervovat místo {label}',
    openSpotAction: 'Otevřít místo {label}',
    tileLocked: 'rezervace uzamčeny',
    tileEditing: 'právě upravuje',
    waiting: '{count} ve frontě',
    spotMenu: 'Možnosti místa {label}',
    spotMenuManage: 'Upravit rezervaci',
    noPlate: 'SPZ neuvedena',

    legendTaken: 'obsazeno',
    legendFree: 'volné',
    legendWaitlist: 'waitlist / editace',

    previousDay: 'Předchozí den',
    nextDay: 'Následující den',
    today: 'Dnes',
    monthLabel: 'Měsíc',
    yearLabel: 'Rok',
    workday: 'Pracovní den',
    holiday: 'Státní svátek · {name}',
    weekend: 'Víkend',

    bannerOpen: 'Rezervace na {month} jsou otevřené — zapisovat lze do {until}.',
    bannerOpenForced: 'Rezervace na {month} jsou otevřené.',
    bannerLockedAdmin:
      'Rezervace na {month} jsou uzamčené. Jako admin je můžete dál upravovat i rušit.',
    bannerLockedUser:
      'Rezervace na {month} jsou uzamčené. Novou rezervaci už nezaložíte, svoji můžete kdykoliv zrušit.',
    bannerNotYetOpen: 'Rezervace na {month} se zatím neotevřely — otevřou se {from}.',
    bannerNotYetOpenForced: 'Rezervace na {month} se zatím neotevřely.',

    modalEyebrow: 'Místo {label}',
    titleReserve: 'Rezervovat místo',
    titleQueue: 'Přidat se do fronty',
    titleQueued: 'Jste ve frontě',
    titleMine: 'Vaše rezervace',
    titleEdit: 'Upravit rezervaci',
    titleInfo: 'Rezervace uzamčeny',
    subReserve: 'Zapište se na {date}.',
    subQueue:
      'Místo je na tento den obsazené. Zařadíme vás do fronty — pokud se uvolní, místo dostane první v řadě.',
    subQueued: 'Až se místo uvolní, dostane ho první v řadě. Z fronty můžete kdykoliv odejít.',
    subMine: 'Rezervaci můžete zrušit — místo se tím uvolní prvnímu ve frontě.',
    subMineLocked:
      'Měsíc je uzamčený — novou rezervaci už nezaložíte, tuhle ale můžete kdykoliv zrušit.',
    subInfo:
      'Tohle místo je volné, ale měsíc už je pro rezervace zavřený. Obraťte se na admina, který může místo přiřadit i po uzamčení.',
    subAdmin: 'Jako admin můžete rezervaci kdykoliv zrušit.',
    subTaken: 'Místo je na tento den obsazené.',
    ctaReserve: 'Rezervovat',
    ctaQueue: 'Přidat se do fronty',
    cancelReservation: 'Zrušit rezervaci',
    close: 'Zavřít',
    queueHeading: 'Fronta',
    queueEmpty: 'Nikdo nečeká — budete první v řadě.',
    occupiedBy: 'obsazeno · {plate}',
    queuePosition: 'Ve frontě jste {position}. v pořadí.',
    leaveQueue: 'Odejít z fronty',
    lockNote: 'Rezervace na {month} jsou uzamčené — nové zápisy ani frontu už nelze měnit.',

    emptyTitle: 'Na parkovišti nejsou žádná aktivní místa.',
    emptyDescription: 'Jakmile admin nějaké místo přidá, objeví se tady.',

    realtimeRejected: 'Živé aktualizace jsou odpojené — přehled se nemusí sám obnovovat.',
    realtimeReconnect: 'Připojit znovu',
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
