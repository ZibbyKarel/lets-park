/**
 * The whole API contract, assembled.
 *
 * This object is the binding list of what the backend may implement and what
 * the frontend may call. `apps/api` (Task 12) implements it, `libs/api-client`
 * (Task 11) types the client from it, and nothing outside it may exist.
 *
 * Grouping follows who calls it, not which table it touches: everything under
 * `admin` requires `role: 'ADMIN'`, everything else is available to any active
 * user. That is why spot reads appear twice — `spot.list` for the settings
 * picker, `admin.spot.list` for the management table with its filters.
 */

import { confirmBulkContract, previewBulkContract } from './bulk';
import { getMyProfileContract, regenerateIcsTokenContract, updateMySettingsContract } from './me';
import { getDayOverviewContract } from './overview';
import { cancelReservationContract, createReservationContract } from './reservations';
import {
  getReservationWindowSettingsContract,
  listMonthWindowsContract,
  updateReservationWindowSettingsContract,
} from './reservation-window';
import {
  adminListSpotsContract,
  createSpotContract,
  deactivateSpotContract,
  listSpotsContract,
  updateSpotContract,
} from './spots';
import { adminListUsersContract, adminUpdateUserContract } from './users';
import { joinWaitlistContract, leaveWaitlistContract } from './waitlist';

export const contract = {
  overview: {
    /** Spots, reservations, queue counts and the window state for one day. */
    day: getDayOverviewContract,
  },
  reservation: {
    create: createReservationContract,
    cancel: cancelReservationContract,
    /** Read-only proposal for a set of days in one month. Writes nothing. */
    previewBulk: previewBulkContract,
    /** Same input, real writes, real result. */
    confirmBulk: confirmBulkContract,
  },
  waitlist: {
    join: joinWaitlistContract,
    leave: leaveWaitlistContract,
  },
  spot: {
    /** Active spots, for the preferred-spot picker. Any user. */
    list: listSpotsContract,
  },
  me: {
    get: getMyProfileContract,
    updateSettings: updateMySettingsContract,
    regenerateIcsToken: regenerateIcsTokenContract,
  },
  admin: {
    spot: {
      list: adminListSpotsContract,
      create: createSpotContract,
      update: updateSpotContract,
      deactivate: deactivateSpotContract,
    },
    user: {
      list: adminListUsersContract,
      update: adminUpdateUserContract,
    },
    window: {
      get: getReservationWindowSettingsContract,
      update: updateReservationWindowSettingsContract,
      /** Per-month state table for the "Rezervační okno" admin tab. */
      months: listMonthWindowsContract,
    },
  },
};

export type Contract = typeof contract;
