/**
 * The single Czech message catalog for the whole UI (see `doc/i18n.md`).
 *
 * Shaped the way next-intl expects a `Messages` object: a plain, JSON-like
 * object of strings grouped into namespaces. It is consumed two ways —
 * through `NextIntlClientProvider` inside React (see `./provider.tsx`), and
 * through `createTranslator` outside React (see `translateErrorCode` in
 * `./errors.ts`) — but there is only ever this one object behind both, so the
 * two paths can never disagree.
 *
 * There is no `getRequestConfig` and no `request-config.ts` anywhere in this
 * workspace, and that is deliberate: next-intl's request-config entry point is
 * for server-side locale negotiation, and this app has exactly one locale
 * (`doc/i18n.md`). The provider is handed this object directly.
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
  /** `/settings` — the caller's own settings. */
  readonly settings: string;
  /** `/admin` — administration. */
  readonly administration: string;
}

/**
 * The `/settings` screen: licence plate, preferred spot, and the ICS feed
 * section (Task 26, `doc/design/screens/11-settings.png`).
 *
 * The ICS strings have no design to copy from — `doc/decision/0151-*` records
 * why the section exists at all — so they are original copy, written in the
 * same register as the rest of the shell (`errorUnknown`, `errorTitle`): short,
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
  /** `5 z 9 obsazeno` — the pill in the header. */
  readonly occupiedCount: string;
  /** The header's primary action. Its modal's copy is the `bulk` namespace. */
  readonly bulkReservation: string;

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
  /**
   * Accessible name of the `⋯` admin button on a tile. Not a menu — it opens
   * the same dialog `onOpen` does; see `doc/decision/0125-*`.
   */
  readonly spotMenu: string;
  /** Spoken form of a plate for assistive technology, and the modal's fallback. */
  readonly noPlate: string;
  /** Label of the admin's holder `Select` on a free bay. */
  readonly holderField: string;
  /** The `Select`'s guest option. */
  readonly holderGuestOption: string;
  /** Label of the guest-name `Input`. */
  readonly guestNameField: string;
  /** Shown under the guest-name field when it is empty. */
  readonly guestNameRequired: string;
  /** Label of the overridable plate `Input`. */
  readonly plateField: string;
  /** Badge beside a guest's name in the spot dialog and the admin day/spots tables. */
  readonly guestHolder: string;

  readonly legendTaken: string;
  readonly legendFree: string;
  readonly legendWaitlist: string;

  /** `‹` / `›` / `Dnes` beside the header's date pill. */
  readonly previousDay: string;
  readonly nextDay: string;
  readonly today: string;
  /** Second line of the date pill on an ordinary day. */
  readonly workday: string;
  /** Second line on a public holiday: `STÁTNÍ SVÁTEK · Den české státnosti`. */
  readonly holiday: string;
  /** Second line on a Saturday or Sunday. */
  readonly weekend: string;

  /** Title of the date-picker dialog the header's date pill opens. */
  readonly datePickerTitle: string;
  /** The two selectors inside it. */
  readonly monthLabel: string;
  readonly yearLabel: string;
  readonly weekdayMon: string;
  readonly weekdayTue: string;
  readonly weekdayWed: string;
  readonly weekdayThu: string;
  readonly weekdayFri: string;
  readonly weekdaySat: string;
  readonly weekdaySun: string;
  /** Accessible name of a day button, interpolating its full date. */
  readonly dayCell: string;
  /** Accessible name of the calendar grid itself. */
  readonly gridLabel: string;

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

/**
 * The `/admin` section: its four tabs and everything inside them (Task 27,
 * `doc/design/screens/03-admin-users.png`, `04-admin-spots.png`,
 * `05-admin-window.png`, `06-admin-overview.png`).
 *
 * Three groups of strings need a note:
 *
 * - **Plurals go through ICU**, not through a hand-written table. Czech has
 *   three integer plural categories (`one` = 1, `few` = 2–4, `other` = 5+), and
 *   "7 dní"/"1 den"/"3 dny" differ in all three. next-intl parses these as ICU
 *   MessageFormat with CLDR's Czech rules, so the declension is data, not code.
 * - **`bannerOpenAuto` and friends come in AUTO / forced pairs.** A month whose
 *   `lockMode` is not `AUTO` has a `windowFrom`/`windowTo` that describes what
 *   the automatic rule *would* have done, not what is true
 *   (`libs/contract/src/schemas/reservation-window.ts`). Printing the range in
 *   that case would be a false statement, so the forced wording never names a
 *   date.
 * - **`windowState*` are looked up by the contract's `MonthLockState`**, one key
 *   per member. The suffixes are the enum members verbatim.
 */
export interface CzechAdminMessages {
  /** Small-caps line above the page title. */
  readonly eyebrow: string;
  /** Accessible name of the tab strip. */
  readonly tabsLabel: string;
  readonly tabOverview: string;
  readonly tabUsers: string;
  readonly tabSpots: string;
  readonly tabWindow: string;
  /**
   * "Zrušit" — the dismiss button of every confirmation dialog in this
   * namespace, wherever the dialog is not about a spot.
   *
   * `spotsCancel` is the same word, but it belongs to the spots editor and
   * reads as such at its call site; a users dialog borrowing it made the
   * catalogue lie about which screen the string serves.
   */
  readonly cancel: string;

  /** Day overview (`06-admin-overview.png`). */
  readonly dayEyebrow: string;
  readonly dayFree: string;
  readonly dayTaken: string;
  readonly dayTableTitle: string;
  readonly dayTableDescription: string;
  readonly dayColumnLabel: string;
  readonly dayColumnGroup: string;
  readonly dayColumnStatus: string;
  readonly dayColumnQueue: string;
  readonly dayStatusFree: string;
  readonly dayStatusTaken: string;
  readonly dayQueueCount: string;
  readonly dayQueueNone: string;
  readonly dayEmpty: string;
  readonly dayEmptyDescription: string;
  /** Link to the full parking grid, which is the lot screen's own rendering. */
  readonly dayOpenLot: string;

  /** The window banner, in AUTO / admin-forced pairs. See the note above. */
  readonly bannerOpenAuto: string;
  readonly bannerOpenForced: string;
  readonly bannerLockedAuto: string;
  readonly bannerLockedForced: string;
  readonly bannerNotYetOpenAuto: string;
  readonly bannerNotYetOpenForced: string;

  /** Users (`03-admin-users.png`). */
  readonly usersTitle: string;
  readonly usersDescription: string;
  readonly usersSearchLabel: string;
  readonly usersSearchPlaceholder: string;
  readonly usersColumnName: string;
  readonly usersColumnEmail: string;
  readonly usersColumnAdmin: string;
  readonly usersColumnActive: string;
  readonly usersAdminToggleLabel: string;
  readonly usersActiveToggleLabel: string;
  /**
   * The same switch on the viewer's own row, where it is disabled. The reason
   * is folded into the accessible name rather than left to the `title`
   * attribute, which screen readers announce inconsistently and touch devices
   * never show at all.
   */
  readonly usersSelfActiveToggleLabel: string;
  /** Why an admin's own "aktivní" switch is disabled. Shown on hover. */
  readonly usersSelfActiveHint: string;
  /**
   * The confirmation an admin gets before taking their own `ADMIN` role away.
   *
   * Unlike the "aktivní" switch this one is **not** disabled: stepping down is
   * a legitimate thing to do, and the API still refuses it for the last active
   * admin. But it is one unlabelled click away from losing `/správa` — the tab
   * simply disappears — and only another admin can undo it, which is exactly
   * the shape of action a confirmation exists for.
   */
  readonly usersSelfRoleConfirmTitle: string;
  readonly usersSelfRoleConfirmDescription: string;
  readonly usersSelfRoleConfirmAction: string;
  readonly usersEmpty: string;
  readonly usersEmptySearch: string;
  readonly usersEmptySearchDescription: string;

  /** Parking spots (`04-admin-spots.png`). */
  readonly spotsTitle: string;
  readonly spotsDescription: string;
  readonly spotsAdd: string;
  readonly spotsCategories: string;
  readonly spotsCategoriesFixed: string;
  readonly spotsColumnLabel: string;
  readonly spotsColumnGroup: string;
  readonly spotsColumnToday: string;
  readonly spotsColumnActive: string;
  readonly spotsColumnActions: string;
  readonly spotsGroupSelectLabel: string;
  readonly spotsActiveToggleLabel: string;
  readonly spotsEdit: string;
  readonly spotsDelete: string;
  readonly spotsEmpty: string;
  readonly spotsEmptyDescription: string;
  readonly spotsCreateTitle: string;
  readonly spotsEditTitle: string;
  readonly spotsLabelField: string;
  readonly spotsLabelRequired: string;
  readonly spotsGroupField: string;
  readonly spotsSave: string;
  readonly spotsCancel: string;
  /** `CONFLICT` from `admin.spot.create`/`update`: the label is taken. */
  readonly spotsDuplicateLabel: string;
  readonly spotsDeleteTitle: string;
  readonly spotsDeleteDescription: string;
  readonly spotsDeleteConfirm: string;
  /** `CONFLICT` from `admin.spot.deactivate`: reservations still point at it. */
  readonly spotsDeleteConflict: string;
  readonly spotsInactive: string;
  readonly spotsTodayUnknown: string;

  /** Reservation window (`05-admin-window.png`). */
  readonly windowOpenTitle: string;
  readonly windowOpenDescription: string;
  readonly windowDaysLabel: string;
  readonly windowDaysValue: string;
  readonly windowDaysDecrement: string;
  readonly windowDaysIncrement: string;
  readonly windowLockLabel: string;
  readonly windowLockAUTO: string;
  readonly windowLockFORCE_OPEN: string;
  readonly windowLockFORCE_LOCKED: string;
  readonly windowMonthsTitle: string;
  readonly windowMonthsDescription: string;
  readonly windowMonthRangeAuto: string;
  readonly windowMonthRangeForced: string;
  readonly windowStateOPEN: string;
  readonly windowStateLOCKED: string;
  readonly windowStateNOT_YET_OPEN: string;
  readonly windowSaved: string;

  /**
   * Failure copy for the admin **writes**, one sentence per (operation, error
   * code) pair rather than one per code.
   *
   * The `errors` namespace above translates the contract's codes for a reader
   * who has no other context — which is the right thing for a whole screen that
   * failed to load, and the wrong thing here. `CONFLICT` is the clearest case:
   * on `admin.user.update` it means the last active administrator would be gone,
   * on `admin.spot.create` it means the label is taken, and on
   * `admin.spot.deactivate` it means somebody still holds the spot. One sentence
   * covering all three would have to be vague enough to explain none of them.
   *
   * `errFallback*` is what an operation shows for a code it has no specific
   * sentence for. It says the operation failed and invites a retry, which is
   * true of anything unexpected; it never guesses at a cause.
   */
  readonly errForbidden: string;
  readonly errUserConflict: string;
  readonly errUserNotFound: string;
  readonly errUserValidation: string;
  readonly errFallbackUser: string;
  readonly errSpotNotFound: string;
  readonly errSpotValidation: string;
  readonly errFallbackSpot: string;
  readonly errWindowConflict: string;
  readonly errWindowValidation: string;
  readonly errFallbackWindow: string;
}

/**
 * The bulk-reservation modal (Task 31, `doc/bulk-reservation-modal.md`).
 *
 * Its own namespace rather than more keys under `lot`, for one reason that is
 * not tidiness: the modal has to say what went wrong when a *bulk* request
 * fails, and the `errors` namespace's sentences are written for a single-day
 * reservation. `VALIDATION_FAILED` is the clearest case — under `errors` it
 * says "weekend or holiday", which for a bulk request is never true
 * (`doc/decision/0090-*` makes a weekend a per-day fact, not an error), so
 * reusing it would tell the user something that did not happen.
 */
export interface CzechBulkMessages {
  readonly title: string;
  readonly description: string;

  /** Column heads of the month grid, Monday first (`doc/design/screens/10-modal-bulk.png`). */
  readonly weekdayMon: string;
  readonly weekdayTue: string;
  readonly weekdayWed: string;
  readonly weekdayThu: string;
  readonly weekdayFri: string;
  readonly weekdaySat: string;
  readonly weekdaySun: string;

  /** Accessible name of one selectable day cell, and of one that is blocked. */
  readonly dayCell: string;
  readonly dayCellBlocked: string;
  readonly gridLabel: string;

  readonly nonSelectableNote: string;
  /** `Preferované místo: E2.92` and the four cases where there is no label. */
  readonly preferredSpot: string;
  readonly preferredSpotNone: string;
  readonly preferredSpotLoading: string;
  /**
   * Either read failed. Distinct from `preferredSpotLoading`, which promises a
   * resolution that a failed query will never deliver.
   */
  readonly preferredSpotUnknown: string;
  /**
   * The preferred spot is set but is not among the active spots — it was
   * deactivated after the user chose it. Saying so is the point: a blank label
   * would leave the user thinking the plan starts from a spot it cannot.
   */
  readonly preferredSpotUnavailable: string;

  readonly close: string;
  readonly ctaSelectDays: string;
  readonly ctaGenerate: string;
  readonly ctaConfirm: string;
  readonly ctaBack: string;
  readonly ctaDone: string;

  readonly scheduleTitle: string;
  readonly scheduleDescription: string;
  readonly scheduleSummary: string;

  readonly badgeAssignedPreferred: string;
  readonly badgeAssigned: string;
  readonly badgeQueued: string;
  readonly badgeAlreadyReserved: string;
  readonly badgeNotBusinessDay: string;
  readonly badgeNoSpots: string;

  readonly resultTitle: string;
  readonly resultDescription: string;
  /** Shown when the confirmation matched the proposal day for day. */
  readonly resultUnchanged: string;
  /** Shown when it did not — the whole reason the flow has two steps. */
  readonly resultChangedTitle: string;
  readonly resultChangedDescription: string;
  readonly resultChangedProposed: string;
  readonly resultChangedActual: string;
  readonly resultChangedMissing: string;

  /** The month is locked for this caller — see `doc/decision/0173-*`. */
  readonly lockedTitle: string;
  readonly lockedDescription: string;

  readonly errorPastDate: string;
  readonly errorOutOfHorizon: string;
  readonly errorLocked: string;
  readonly errorValidation: string;
  readonly errorConflict: string;
  readonly errorForbidden: string;
  readonly errorUnknown: string;
}

export interface CzechMessages {
  readonly errors: CzechErrorMessages;
  readonly shell: CzechShellMessages;
  readonly login: CzechLoginMessages;
  readonly nav: CzechNavMessages;
  readonly sections: CzechSectionMessages;
  readonly settings: CzechSettingsMessages;
  readonly lot: CzechLotMessages;
  readonly admin: CzechAdminMessages;
  readonly bulk: CzechBulkMessages;
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
  lot: {
    occupiedCount: '{taken} z {total} obsazeno',
    bulkReservation: 'Hromadná rezervace',

    groupFree: '{free} z {total} volných',
    groupLabel: 'Skupina {group}',

    free: 'Volné',
    reserveSpotAction: 'Rezervovat místo {label}',
    openSpotAction: 'Otevřít místo {label}',
    tileLocked: 'rezervace uzamčeny',
    tileEditing: 'právě upravuje',
    waiting: '{count} ve frontě',
    spotMenu: 'Možnosti místa {label}',
    noPlate: 'SPZ neuvedena',
    holderField: 'Rezervovat pro',
    holderGuestOption: 'Hosta',
    guestNameField: 'Jméno hosta',
    guestNameRequired: 'Zadejte jméno hosta.',
    plateField: 'SPZ',
    guestHolder: 'Host',

    legendTaken: 'obsazeno',
    legendFree: 'volné',
    legendWaitlist: 'waitlist / editace',

    previousDay: 'Předchozí den',
    nextDay: 'Následující den',
    today: 'Dnes',
    workday: 'Pracovní den',
    holiday: 'Státní svátek · {name}',
    weekend: 'Víkend',

    datePickerTitle: 'Vybrat datum',
    monthLabel: 'Měsíc',
    yearLabel: 'Rok',
    weekdayMon: 'PO',
    weekdayTue: 'ÚT',
    weekdayWed: 'ST',
    weekdayThu: 'ČT',
    weekdayFri: 'PÁ',
    weekdaySat: 'SO',
    weekdaySun: 'NE',
    dayCell: '{date}',
    gridLabel: 'Výběr data',

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
  admin: {
    eyebrow: 'Administrace',
    tabsLabel: 'Sekce správy',
    tabOverview: 'Přehled parkoviště',
    tabUsers: 'Uživatelé',
    tabSpots: 'Parkovací místa',
    tabWindow: 'Rezervační okno',
    cancel: 'Zrušit',

    dayEyebrow: 'Přehled parkoviště',
    dayFree: '{count} volných',
    dayTaken: '{count} obsazených',
    dayTableTitle: 'Místa dnes',
    dayTableDescription: 'Kdo kde parkuje a kolik lidí čeká ve frontě',
    dayColumnLabel: 'Štítek',
    dayColumnGroup: 'Kategorie',
    dayColumnStatus: 'Stav',
    dayColumnQueue: 'Fronta',
    dayStatusFree: 'Volné',
    dayStatusTaken: 'Obsazeno — {name}',
    dayQueueCount: '{count} ve frontě',
    dayQueueNone: 'Nikdo nečeká',
    dayEmpty: 'Na parkovišti nejsou žádná aktivní místa',
    dayEmptyDescription: 'Přidejte místa v záložce Parkovací místa.',
    dayOpenLot: 'Otevřít parkoviště',

    bannerOpenAuto: 'Rezervace na {month} jsou otevřené — zapisovat lze do {until}.',
    bannerOpenForced: 'Rezervace na {month} jsou otevřené — otevření vynutil admin.',
    bannerLockedAuto: 'Rezervace na {month} jsou uzamčené.',
    bannerLockedForced: 'Rezervace na {month} jsou uzamčené — uzamčení vynutil admin.',
    bannerNotYetOpenAuto: 'Rezervace na {month} se otevřou {from}.',
    bannerNotYetOpenForced: 'Rezervace na {month} zatím nejsou otevřené.',

    usersTitle: 'Uživatelé',
    usersDescription:
      '{count, plural, one {# účet} few {# účty} other {# účtů}} ze SSO · admin roli lze kdykoliv přidat i odebrat',
    usersSearchLabel: 'Hledat uživatele',
    usersSearchPlaceholder: 'Hledat jméno nebo e-mail',
    usersColumnName: 'Jméno',
    usersColumnEmail: 'E-mail',
    usersColumnAdmin: 'Admin',
    usersColumnActive: 'Aktivní',
    usersAdminToggleLabel: 'Admin role — {name}',
    usersActiveToggleLabel: 'Aktivní účet — {name}',
    usersSelfActiveToggleLabel: 'Aktivní účet — {name} · vlastní účet nelze deaktivovat',
    usersSelfActiveHint: 'Vlastní účet nelze deaktivovat.',
    usersSelfRoleConfirmTitle: 'Odebrat si roli administrátora?',
    usersSelfRoleConfirmDescription:
      'Přijdete o přístup do Správy. Vrátit vám roli může potom už jen jiný administrátor.',
    usersSelfRoleConfirmAction: 'Odebrat roli',
    usersEmpty: 'Žádní uživatelé',
    usersEmptySearch: 'Hledání nic nenašlo',
    usersEmptySearchDescription: 'Zkuste jiné jméno nebo e-mail.',

    spotsTitle: 'Parkovací místa',
    spotsDescription: 'Štítek, kategorie a dostupnost míst',
    spotsAdd: 'Přidat místo',
    spotsCategories: 'Kategorie',
    spotsCategoriesFixed: 'Kategorie jsou pevně dané — IT a Shared.',
    spotsColumnLabel: 'Štítek',
    spotsColumnGroup: 'Kategorie',
    spotsColumnToday: 'Stav dnes',
    spotsColumnActive: 'Aktivní',
    spotsColumnActions: 'Akce',
    spotsGroupSelectLabel: 'Kategorie místa {label}',
    spotsActiveToggleLabel: 'Aktivní místo {label}',
    spotsEdit: 'Upravit',
    spotsDelete: 'Smazat',
    spotsEmpty: 'Zatím tu nejsou žádná místa',
    spotsEmptyDescription: 'Přidejte první parkovací místo.',
    spotsCreateTitle: 'Nové parkovací místo',
    spotsEditTitle: 'Upravit místo {label}',
    spotsLabelField: 'Štítek',
    spotsLabelRequired: 'Zadejte štítek místa.',
    spotsGroupField: 'Kategorie',
    spotsSave: 'Uložit',
    spotsCancel: 'Zrušit',
    spotsDuplicateLabel: 'Místo s tímto štítkem už existuje.',
    spotsDeleteTitle: 'Smazat místo {label}?',
    spotsDeleteDescription:
      'Místo zmizí z parkoviště, ale historie rezervací zůstane zachovaná. Smazat ho nelze, dokud na něj někdo má rezervaci ode dneška dál.',
    spotsDeleteConfirm: 'Smazat',
    spotsDeleteConflict: 'Na tomto místě jsou rezervace ode dneška dál. Nejdřív je zrušte.',
    spotsInactive: 'Neaktivní',
    spotsTodayUnknown: '—',

    windowOpenTitle: 'Otevření nového měsíce',
    windowOpenDescription:
      'Kolik dní před začátkem měsíce se otevřou rezervace na ten měsíc. Po začátku měsíce se rezervace uzamknou — upravovat je pak může jen admin, uživatel může svoji rezervaci kdykoliv zrušit.',
    windowDaysLabel: 'Otevřít X dní předem',
    windowDaysValue: '{count, plural, one {# den} few {# dny} other {# dní}}',
    windowDaysDecrement: 'O den méně',
    windowDaysIncrement: 'O den více',
    windowLockLabel: 'Režim zámku',
    windowLockAUTO: 'Automaticky',
    windowLockFORCE_OPEN: 'Vynutit otevřeno',
    windowLockFORCE_LOCKED: 'Vynutit uzamčeno',
    windowMonthsTitle: 'Stav měsíců',
    windowMonthsDescription: 'Podle nastavení vlevo · dnes je {today}',
    windowMonthRangeAuto: 'otevřeno {from} – {to}',
    windowMonthRangeForced: 'automaticky by bylo otevřeno {from} – {to}',
    windowStateOPEN: 'Otevřeno',
    windowStateLOCKED: 'Uzamčeno',
    windowStateNOT_YET_OPEN: 'Zatím neotevřeno',
    windowSaved: 'Nastavení uloženo.',

    errForbidden: 'K této akci nemáte oprávnění.',
    errUserConflict: 'Poslední aktivní administrátor nemůže přijít o roli ani být deaktivován.',
    errUserNotFound: 'Tento účet už neexistuje. Obnovte prosím stránku.',
    errUserValidation: 'Tuto změnu role ani aktivity účtu nelze provést.',
    errFallbackUser: 'Změnu účtu se nepodařilo uložit. Zkuste to prosím znovu.',
    errSpotNotFound: 'Toto místo už neexistuje. Obnovte prosím stránku.',
    errSpotValidation: 'Štítek nebo kategorie místa nejsou platné.',
    errFallbackSpot: 'Změnu místa se nepodařilo uložit. Zkuste to prosím znovu.',
    errWindowConflict: 'Nastavení mezitím změnil někdo jiný. Obnovte prosím stránku.',
    errWindowValidation: 'Počet dní musí být mezi 1 a 31.',
    errFallbackWindow: 'Nastavení se nepodařilo uložit. Zkuste to prosím znovu.',
  },
  errors: {
    SPOT_ALREADY_RESERVED: 'Toto parkovací místo je na daný den už rezervované.',
    RESERVATION_LIMIT_REACHED:
      'Uživatel už na tento den rezervaci má — na den je povolená jen jedna.',
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
  bulk: {
    title: 'Hromadná rezervace',
    description:
      'Vyberte dny v {month}. Místo přiřadíme automaticky — kde nebude volno, zařadíme vás do fronty.',

    weekdayMon: 'PO',
    weekdayTue: 'ÚT',
    weekdayWed: 'ST',
    weekdayThu: 'ČT',
    weekdayFri: 'PÁ',
    weekdaySat: 'SO',
    weekdaySun: 'NE',

    dayCell: '{date}',
    dayCellBlocked: '{date} — nelze vybrat',
    gridLabel: 'Výběr dní',

    nonSelectableNote: 'Víkendy a svátky nelze vybrat.',
    preferredSpot: 'Preferované místo: {label}',
    preferredSpotNone: 'Preferované místo: nemáte nastavené',
    preferredSpotLoading: 'Preferované místo: načítá se…',
    preferredSpotUnknown: 'Preferované místo: nepodařilo se zjistit',
    preferredSpotUnavailable: 'Preferované místo: už není k dispozici',

    close: 'Zavřít',
    ctaSelectDays: 'Vyberte dny',
    ctaGenerate: 'Vygenerovat rozvrh ({count, plural, one {# den} few {# dny} other {# dní}})',
    ctaConfirm: 'Potvrdit rozvrh',
    ctaBack: 'Zpět na výběr',
    ctaDone: 'Hotovo',

    scheduleTitle: 'Návrh rozvrhu',
    scheduleDescription:
      'Takhle vás zapíšeme. Než rozvrh potvrdíte, může se stav parkoviště změnit — po potvrzení uvidíte, co se skutečně stalo.',
    scheduleSummary:
      '{assigned, plural, one {# den} few {# dny} other {# dní}} s místem, {queued, plural, one {# den} few {# dny} other {# dní}} ve frontě.',

    badgeAssignedPreferred: 'Rezervováno · preferované',
    badgeAssigned: 'Rezervováno',
    badgeQueued: '{position}. ve frontě',
    badgeAlreadyReserved: 'Už máte rezervaci',
    badgeNotBusinessDay: 'Víkend nebo svátek',
    badgeNoSpots: 'Žádné místo',

    resultTitle: 'Rozvrh potvrzen',
    resultDescription: 'Takhle jsme vás zapsali.',
    resultUnchanged: 'Zapsali jsme vás přesně podle návrhu.',
    resultChangedTitle: 'Rozvrh se od návrhu liší',
    resultChangedDescription:
      'Než jste rozvrh potvrdili, změnil se stav parkoviště. U těchto dnů jsme vás zapsali jinak, než návrh sliboval:',
    resultChangedProposed: 'Návrh',
    resultChangedActual: 'Skutečnost',
    resultChangedMissing: 'nic',

    lockedTitle: 'Rezervace jsou uzamčené',
    lockedDescription:
      'Rezervace na tento měsíc jsou uzamčené — hromadnou rezervaci teď založit nelze.',

    errorPastDate: 'Ve výběru je den, který už je v minulosti. Odeberte ho a zkuste to znovu.',
    errorOutOfHorizon: 'Rezervace na tento měsíc se zatím neotevřely.',
    errorLocked: 'Rezervace na tento měsíc jsou uzamčené — hromadnou rezervaci už založit nelze.',
    errorValidation:
      'Výběr dní neprošel kontrolou — vyberte alespoň jeden den a všechny v jednom měsíci.',
    errorConflict:
      'Někdo jiný mezitím obsadil místa, se kterými rozvrh počítal. Nezapsali jsme nic — vygenerujte rozvrh znovu.',
    errorForbidden: 'K hromadné rezervaci nemáte oprávnění.',
    errorUnknown: 'Hromadnou rezervaci se nepodařilo dokončit. Zkuste to prosím znovu za chvíli.',
  },
};
