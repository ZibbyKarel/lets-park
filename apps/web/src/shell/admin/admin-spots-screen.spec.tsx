import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '@lets-park/api-client';
import { ERROR_DEFINITIONS } from '@lets-park/contract';
import type { ErrorCode, ParkingSpot } from '@lets-park/contract';
import { csMessages, IntlProvider } from '@lets-park/i18n';
import { AdminSpotsScreen, type SpotToday } from './admin-spots-screen';
import type { AdminSpotsScreenProps } from './admin-spots-screen';

const TIMESTAMP = '2026-08-28T09:15:00.000Z';

/** See `admin-errors.spec.tsx` — a real `RPCLink` failure, only `fetch` stubbed. */
async function failureWithCode(code: ErrorCode): Promise<unknown> {
  const status = ERROR_DEFINITIONS[code].status;
  const client = createApiClient({
    url: 'https://api.test/rpc',
    fetch: async () =>
      new Response(
        JSON.stringify({
          json: { defined: false as const, code, status, message: 'developer-facing' },
          meta: [],
        }),
        { status, headers: { 'content-type': 'application/json' } }
      ),
  });

  const marker = Symbol('resolved');
  const outcome = await client.me.get().then(
    () => marker,
    (error: unknown) => error
  );
  if (outcome === marker) {
    throw new Error('expected the call to reject, but it resolved');
  }
  return outcome;
}

function aSpot(overrides: Partial<ParkingSpot> & { id: string; label: string }): ParkingSpot {
  return {
    group: 'IT',
    active: true,
    createdAt: TIMESTAMP,
    updatedAt: TIMESTAMP,
    ...overrides,
  };
}

const TAKEN = aSpot({ id: 's1', label: 'E2.92' });
const FREE = aSpot({ id: 's2', label: 'E2.93' });
const SHARED = aSpot({ id: 's3', label: 'E2.96', group: 'SHARED' });
const RETIRED = aSpot({ id: 's4', label: 'E2.99', active: false });

const TODAY: ReadonlyMap<string, SpotToday> = new Map([
  [TAKEN.id, { holderName: 'Karel Zíbar' }],
  [FREE.id, { holderName: null }],
  [SHARED.id, { holderName: 'Lucie Marková' }],
]);

function renderScreen(overrides: Partial<AdminSpotsScreenProps> = {}) {
  const onRetry = jest.fn();
  const onCreate = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
  const onSave = jest.fn<Promise<void>, [unknown]>().mockResolvedValue(undefined);
  const onActiveChange = jest.fn();
  const onDeactivate = jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined);

  const props: AdminSpotsScreenProps = {
    isPending: false,
    isError: false,
    error: null,
    onRetry,
    spots: [TAKEN, FREE, SHARED, RETIRED],
    todayBySpotId: TODAY,
    onCreate,
    onSave,
    onActiveChange,
    onDeactivate,
    pendingSpotId: null,
    isSaving: false,
    writeError: null,
    writeErrorFrom: null,
    ...overrides,
  };

  render(
    <IntlProvider>
      <AdminSpotsScreen {...props} />
    </IntlProvider>
  );

  return { onRetry, onCreate, onSave, onActiveChange, onDeactivate, user: userEvent.setup() };
}

/**
 * Scopes a query to the open dialog.
 *
 * "Kategorie" and "Štítek" each name two things on this screen — a column
 * header and a filter band outside the dialog, a form field inside it — so an
 * unscoped `getByLabelText` matches the wrong one.
 */
function inDialog() {
  return within(screen.getByRole('dialog'));
}

function rowOf(spot: ParkingSpot): HTMLElement {
  const row = document.querySelector(`[data-row-id="${spot.id}"]`);
  if (!(row instanceof HTMLElement)) {
    throw new Error(`no row rendered for ${spot.label}`);
  }
  return row;
}

describe('AdminSpotsScreen', () => {
  it('lists every spot, retired ones included — this is where they are revived', () => {
    renderScreen();

    expect(within(rowOf(TAKEN)).getByText('E2.92')).toBeInTheDocument();
    expect(within(rowOf(RETIRED)).getByText('E2.99')).toBeInTheDocument();
    expect(within(rowOf(RETIRED)).getByText('Neaktivní')).toBeInTheDocument();
    expect(within(rowOf(TAKEN)).queryByText('Neaktivní')).not.toBeInTheDocument();
  });

  describe('the "Stav dnes" column', () => {
    it('names the holder of a spot somebody parked on', () => {
      renderScreen();

      expect(within(rowOf(TAKEN)).getByText('Obsazeno — Karel Zíbar')).toBeInTheDocument();
    });

    it('says a spot is free when the day overview says nobody holds it', () => {
      renderScreen();

      expect(within(rowOf(FREE)).getByText('Volné')).toBeInTheDocument();
    });

    it('says nothing about a spot the day overview does not carry', () => {
      // A retired spot is not in the day overview at all. Rendering "Volné"
      // for it would be a claim about a spot nobody can book.
      renderScreen();

      expect(within(rowOf(RETIRED)).getByText('—')).toBeInTheDocument();
      expect(within(rowOf(RETIRED)).queryByText('Volné')).not.toBeInTheDocument();
    });
  });

  describe('the category band', () => {
    it('counts every listed spot per category, retired ones included', () => {
      // Three IT (E2.92, E2.93, E2.99) and one SHARED. A count that hid the
      // retired spot would disagree with the rows underneath it.
      renderScreen();

      const band = screen.getByRole('group', { name: 'Kategorie' });
      expect(within(band).getByText('3')).toBeInTheDocument();
      expect(within(band).getByText('1')).toBeInTheDocument();
    });

    it('says the list of categories is fixed, and offers no way to add one', () => {
      renderScreen();

      expect(screen.getByText('Kategorie jsou pevně dané — IT a Shared.')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Přidat kategorii/u })).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/Nová kategorie/u)).not.toBeInTheDocument();
    });
  });

  describe('the inline category picker', () => {
    it('shows the spot’s current category, which is always one of the options', () => {
      renderScreen();

      expect(
        within(rowOf(SHARED)).getByRole('combobox', { name: 'Kategorie místa E2.96' })
      ).toHaveValue('SHARED');
    });

    it('offers exactly the closed enum, no more', () => {
      renderScreen();

      const select = within(rowOf(TAKEN)).getByRole('combobox', { name: 'Kategorie místa E2.92' });
      expect(
        within(select)
          .getAllByRole('option')
          .map((o) => o.textContent)
      ).toEqual(['IT', 'SHARED']);
    });

    it('saves the label unchanged alongside the new category', async () => {
      const { onSave, user } = renderScreen();

      await user.selectOptions(
        within(rowOf(TAKEN)).getByRole('combobox', { name: 'Kategorie místa E2.92' }),
        'SHARED'
      );

      expect(onSave).toHaveBeenCalledWith({ id: TAKEN.id, label: 'E2.92', group: 'SHARED' });
    });
  });

  describe('the activity switch', () => {
    it('reflects the spot, and reports the state it moved to', async () => {
      const { onActiveChange, user } = renderScreen();

      expect(
        within(rowOf(TAKEN)).getByRole('switch', { name: 'Aktivní místo E2.92' })
      ).toBeChecked();

      await user.click(within(rowOf(TAKEN)).getByRole('switch', { name: 'Aktivní místo E2.92' }));
      expect(onActiveChange).toHaveBeenLastCalledWith(TAKEN.id, false);
    });

    it('brings a retired spot back', async () => {
      const { onActiveChange, user } = renderScreen();

      await user.click(within(rowOf(RETIRED)).getByRole('switch', { name: 'Aktivní místo E2.99' }));

      expect(onActiveChange).toHaveBeenLastCalledWith(RETIRED.id, true);
    });

    it('freezes only the row being written', () => {
      renderScreen({ pendingSpotId: TAKEN.id });

      expect(
        within(rowOf(TAKEN)).getByRole('switch', { name: 'Aktivní místo E2.92' })
      ).toBeDisabled();
      expect(
        within(rowOf(FREE)).getByRole('switch', { name: 'Aktivní místo E2.93' })
      ).toBeEnabled();
    });
  });

  describe('adding a spot', () => {
    it('opens a form with the label and the category', async () => {
      const { user } = renderScreen();

      await user.click(screen.getByRole('button', { name: 'Přidat místo' }));

      expect(screen.getByRole('dialog', { name: 'Nové parkovací místo' })).toBeInTheDocument();
      expect(inDialog().getByLabelText('Štítek')).toHaveValue('');
    });

    it('sends the label and category that were typed', async () => {
      const { onCreate, user } = renderScreen();

      await user.click(screen.getByRole('button', { name: 'Přidat místo' }));
      await user.type(inDialog().getByLabelText('Štítek'), 'E2.10');
      await user.selectOptions(inDialog().getByLabelText('Kategorie'), 'SHARED');
      await user.click(inDialog().getByRole('button', { name: 'Uložit' }));

      await waitFor(() =>
        expect(onCreate).toHaveBeenCalledWith({ label: 'E2.10', group: 'SHARED' })
      );
    });

    it('refuses an empty label without calling the API', async () => {
      const { onCreate, user } = renderScreen();

      await user.click(screen.getByRole('button', { name: 'Přidat místo' }));
      await user.click(screen.getByRole('button', { name: 'Uložit' }));

      expect(await screen.findByText('Zadejte štítek místa.')).toBeInTheDocument();
      expect(onCreate).not.toHaveBeenCalled();
    });

    it('closes once the spot exists', async () => {
      const { user } = renderScreen();

      await user.click(screen.getByRole('button', { name: 'Přidat místo' }));
      await user.type(inDialog().getByLabelText('Štítek'), 'E2.10');
      await user.click(inDialog().getByRole('button', { name: 'Uložit' }));

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('stays open, explaining a duplicate label rather than a lost race', async () => {
      const conflict = await failureWithCode('CONFLICT');
      const { user } = renderScreen({
        onCreate: jest.fn<Promise<void>, [unknown]>().mockRejectedValue(conflict),
        writeError: conflict,
        writeErrorFrom: 'spotCreate',
      });

      await user.click(screen.getByRole('button', { name: 'Přidat místo' }));
      await user.type(inDialog().getByLabelText('Štítek'), 'E2.92');
      await user.click(inDialog().getByRole('button', { name: 'Uložit' }));

      // Scoped to the dialog on purpose. The dialog is a modal — it covers
      // the table — so a sentence rendered above the table would be present in
      // the DOM and invisible to the person who just pressed Save.
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(inDialog().getByText('Místo s tímto štítkem už existuje.')).toBeInTheDocument();
      expect(screen.queryByText(csMessages.errors.CONFLICT)).not.toBeInTheDocument();
    });
  });

  describe('editing a spot', () => {
    it('opens seeded with the spot’s current values', async () => {
      const { user } = renderScreen();

      await user.click(within(rowOf(SHARED)).getByRole('button', { name: 'Upravit' }));

      expect(screen.getByRole('dialog', { name: 'Upravit místo E2.96' })).toBeInTheDocument();
      expect(inDialog().getByLabelText('Štítek')).toHaveValue('E2.96');
      expect(inDialog().getByLabelText('Kategorie')).toHaveValue('SHARED');
    });

    it('sends the edited values with the spot’s id', async () => {
      const { onSave, user } = renderScreen();

      await user.click(within(rowOf(SHARED)).getByRole('button', { name: 'Upravit' }));
      await user.clear(inDialog().getByLabelText('Štítek'));
      await user.type(inDialog().getByLabelText('Štítek'), 'E2.97');
      await user.click(inDialog().getByRole('button', { name: 'Uložit' }));

      await waitFor(() =>
        expect(onSave).toHaveBeenCalledWith({ id: SHARED.id, label: 'E2.97', group: 'SHARED' })
      );
    });
  });

  describe('"Smazat"', () => {
    it('asks first, and retires nothing until it is confirmed', async () => {
      const { onDeactivate, user } = renderScreen();

      await user.click(within(rowOf(FREE)).getByRole('button', { name: 'Smazat' }));

      expect(screen.getByRole('dialog', { name: 'Smazat místo E2.93?' })).toBeInTheDocument();
      expect(onDeactivate).not.toHaveBeenCalled();
    });

    it('says the history survives — the row is never actually deleted', async () => {
      const { user } = renderScreen();

      await user.click(within(rowOf(FREE)).getByRole('button', { name: 'Smazat' }));

      expect(
        screen.getByText(
          'Místo zmizí z parkoviště, ale historie rezervací zůstane zachovaná. Smazat ho nelze, dokud na něj někdo má rezervaci ode dneška dál.'
        )
      ).toBeInTheDocument();
    });

    it('retires the spot on confirmation and closes', async () => {
      const { onDeactivate, user } = renderScreen();

      await user.click(within(rowOf(FREE)).getByRole('button', { name: 'Smazat' }));
      // The last "Smazat" on the page is the dialog's confirming button; the
      // earlier ones are the rows' own.
      await user.click(screen.getAllByRole('button', { name: 'Smazat' }).at(-1) as HTMLElement);

      await waitFor(() => expect(onDeactivate).toHaveBeenCalledWith(FREE.id));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('changes nothing when it is cancelled', async () => {
      const { onDeactivate, user } = renderScreen();

      await user.click(within(rowOf(FREE)).getByRole('button', { name: 'Smazat' }));
      await user.click(screen.getByRole('button', { name: 'Zrušit' }));

      expect(onDeactivate).not.toHaveBeenCalled();
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('explains a live reservation instead of claiming a duplicate label', async () => {
      const conflict = await failureWithCode('CONFLICT');
      const { user } = renderScreen({
        onDeactivate: jest.fn<Promise<void>, [string]>().mockRejectedValue(conflict),
        writeError: conflict,
        writeErrorFrom: 'spotRetire',
      });

      await user.click(within(rowOf(TAKEN)).getByRole('button', { name: 'Smazat' }));
      await user.click(screen.getAllByRole('button', { name: 'Smazat' }).at(-1) as HTMLElement);

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
      expect(
        inDialog().getByText('Na tomto místě jsou rezervace ode dneška dál. Nejdřív je zrušte.')
      ).toBeInTheDocument();
      // Wrong on this procedure — that is the create/rename sentence.
      expect(screen.queryByText('Místo s tímto štítkem už existuje.')).not.toBeInTheDocument();
      expect(screen.queryByText(csMessages.errors.CONFLICT)).not.toBeInTheDocument();
    });

    it('stays open after a refusal, so the sentence can be read', async () => {
      const conflict = await failureWithCode('CONFLICT');
      const { user } = renderScreen({
        onDeactivate: jest.fn<Promise<void>, [string]>().mockRejectedValue(conflict),
        writeError: conflict,
        writeErrorFrom: 'spotRetire',
      });

      await user.click(within(rowOf(TAKEN)).getByRole('button', { name: 'Smazat' }));
      await user.click(screen.getAllByRole('button', { name: 'Smazat' }).at(-1) as HTMLElement);

      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('a failure with no dialog open', () => {
    it('reads a failed inline switch as the live-reservation rule', async () => {
      renderScreen({
        writeError: await failureWithCode('CONFLICT'),
        writeErrorFrom: 'spotRetire',
      });

      expect(
        screen.getByText('Na tomto místě jsou rezervace ode dneška dál. Nejdřív je zrušte.')
      ).toBeInTheDocument();
      // No dialog is open, so the notice belongs above the table.
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(screen.getByRole('table')).toBeInTheDocument();
    });

    it('refuses to invent a cause when switching a spot back on fails', async () => {
      renderScreen({
        writeError: await failureWithCode('CONFLICT'),
        writeErrorFrom: 'spotRevive',
      });

      expect(
        screen.getByText('Změnu místa se nepodařilo uložit. Zkuste to prosím znovu.')
      ).toBeInTheDocument();
      expect(screen.queryByText('Místo s tímto štítkem už existuje.')).not.toBeInTheDocument();
    });

    it('shows nothing when the last write succeeded', () => {
      renderScreen({ writeError: null, writeErrorFrom: null });

      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  it('says the lot is empty rather than drawing a table of nothing', () => {
    renderScreen({ spots: [] });

    expect(screen.getByText('Zatím tu nejsou žádná místa')).toBeInTheDocument();
    expect(screen.getByText('Přidejte první parkovací místo.')).toBeInTheDocument();
  });

  it('waits while the list is in flight', () => {
    renderScreen({ isPending: true, spots: undefined });

    expect(screen.getByRole('status')).toHaveTextContent('Načítá se…');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('offers a retry when the list could not be loaded', async () => {
    const { onRetry, user } = renderScreen({
      isError: true,
      spots: undefined,
      error: new Error('connection refused'),
    });

    expect(screen.queryByText(/connection refused/u)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zkusit znovu' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
