import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DataTable, type DataTableColumn } from './data-table';

/**
 * Row shape for these tests.
 *
 * Declared as an `interface` on purpose: a caller's `interface` is not
 * assignable to `Record<string, unknown>`, so this fixture is what keeps the
 * `DataTableRow` constraint honest. Swap `DataTableRow` to `unknown` and this
 * file stops compiling.
 *
 * The fields are deliberately generic — the design system is domain-free, so no
 * test here may lean on a parking spot, a reservation or a user.
 */
interface Item {
  id: string;
  label: string;
  category: string;
  count: number;
  note: string | null;
}

const ITEMS: Item[] = [
  { id: 'b', label: 'Beta', category: 'Druhá', count: 2, note: 'bbb' },
  { id: 'c', label: 'Gama', category: 'První', count: 30, note: null },
  { id: 'a', label: 'Alfa', category: 'První', count: 10, note: 'aaa' },
];

const COLUMNS: DataTableColumn<Item>[] = [
  {
    id: 'label',
    header: 'Štítek',
    cell: (row) => row.label,
    sortValue: (row) => row.label,
  },
  {
    id: 'count',
    header: 'Počet',
    cell: (row) => row.count,
    sortValue: (row) => row.count,
    align: 'end',
    width: '96px',
  },
  // No `sortValue` — this column must not be sortable.
  { id: 'category', header: 'Kategorie', cell: (row) => row.category },
];

function renderTable(props: Partial<Parameters<typeof DataTable<Item>>[0]> = {}) {
  return render(
    <DataTable
      title="Položky"
      columns={COLUMNS}
      data={ITEMS}
      getRowId={(row) => row.id}
      emptyTitle="Žádná data"
      {...props}
    />
  );
}

/** The visible text of the first cell of every body row, top to bottom. */
function labelOrder(): string[] {
  const [, ...bodyRows] = screen.getAllByRole('row');

  return bodyRows.map((row) => within(row).getAllByRole('cell')[0]?.textContent ?? '');
}

describe('DataTable', () => {
  describe('structure', () => {
    it('exposes a real table named by the title', () => {
      renderTable();

      expect(screen.getByRole('table', { name: 'Položky' })).toBeInTheDocument();
    });

    it('shows the title and the description in the header band', () => {
      renderTable({ description: 'Tři položky' });

      expect(screen.getByText('Tři položky')).toBeInTheDocument();
      // Once visibly in the card header, once in the sr-only <caption>.
      expect(screen.getAllByText('Položky')).toHaveLength(2);
    });

    it('names itself once, as the table — not also as a landmark around it', () => {
      renderTable();

      // The card `<section>` deliberately carries no `aria-label`. With one it
      // became a named `region` landmark, so the title was announced a third
      // time and three tables on an admin screen produced three same-named
      // landmarks to walk past.
      expect(screen.queryByRole('region')).not.toBeInTheDocument();
      expect(screen.getByRole('table', { name: 'Položky' })).toBeInTheDocument();
    });

    it('renders the actions and the toolbar slots', () => {
      renderTable({
        actions: <button type="button">Přidat</button>,
        toolbar: <span>Filtry</span>,
      });

      expect(screen.getByRole('button', { name: 'Přidat' })).toBeInTheDocument();
      expect(screen.getByText('Filtry')).toBeInTheDocument();
    });

    it('renders one row per datum, keyed by getRowId', () => {
      const { container } = renderTable();

      // Three body rows plus the header row.
      expect(screen.getAllByRole('row')).toHaveLength(4);
      expect(
        [...container.querySelectorAll('[data-row-id]')].map((el) => el.getAttribute('data-row-id'))
      ).toEqual(['b', 'c', 'a']);
    });

    it('renders each cell through its column renderer', () => {
      renderTable();

      expect(screen.getByRole('cell', { name: 'Beta' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: 'Druhá' })).toBeInTheDocument();
      expect(screen.getByRole('cell', { name: '30' })).toBeInTheDocument();
    });

    it('applies a column width through colgroup', () => {
      const { container } = renderTable();
      const cols = container.querySelectorAll('col');

      expect(cols).toHaveLength(3);
      expect(cols[1]).toHaveStyle({ width: '96px' });
    });

    it('applies minWidth to the table element so the card scrolls, not stretches', () => {
      const { container } = renderTable({ minWidth: '560px' });

      expect(container.querySelector('table')).toHaveStyle({ minWidth: '560px' });
    });

    it('aligns an end column right, not left', () => {
      renderTable();

      // `count` is the only column declared with `align: 'end'`.
      expect(screen.getByRole('columnheader', { name: /Počet/ })).toHaveClass('text-right');
    });
  });

  describe('sortable headers', () => {
    it('makes a column with sortValue a button and one without it plain text', () => {
      renderTable();

      expect(
        within(screen.getByRole('columnheader', { name: /Štítek/ })).getByRole('button')
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole('columnheader', { name: 'Kategorie' })).queryByRole('button')
      ).not.toBeInTheDocument();
    });

    it('reports aria-sort=none while unsorted and omits it on a fixed column', () => {
      renderTable();

      expect(screen.getByRole('columnheader', { name: /Štítek/ })).toHaveAttribute(
        'aria-sort',
        'none'
      );
      expect(screen.getByRole('columnheader', { name: 'Kategorie' })).not.toHaveAttribute(
        'aria-sort'
      );
    });
  });

  describe('sorting', () => {
    it('leaves the rows in their given order until a header is pressed', () => {
      renderTable();

      expect(labelOrder()).toEqual(['Beta', 'Gama', 'Alfa']);
    });

    it('sorts ascending on the first press', async () => {
      const user = userEvent.setup();
      renderTable();

      await user.click(screen.getByRole('button', { name: /Štítek/ }));

      expect(labelOrder()).toEqual(['Alfa', 'Beta', 'Gama']);
      expect(screen.getByRole('columnheader', { name: /Štítek/ })).toHaveAttribute(
        'aria-sort',
        'ascending'
      );
    });

    it('flips to descending on the second press', async () => {
      const user = userEvent.setup();
      renderTable();

      await user.click(screen.getByRole('button', { name: /Štítek/ }));
      await user.click(screen.getByRole('button', { name: /Štítek/ }));

      expect(labelOrder()).toEqual(['Gama', 'Beta', 'Alfa']);
      expect(screen.getByRole('columnheader', { name: /Štítek/ })).toHaveAttribute(
        'aria-sort',
        'descending'
      );
    });

    it('flips back to ascending on the third press — there is no unsorted state', async () => {
      const user = userEvent.setup();
      renderTable();

      await user.click(screen.getByRole('button', { name: /Štítek/ }));
      await user.click(screen.getByRole('button', { name: /Štítek/ }));
      await user.click(screen.getByRole('button', { name: /Štítek/ }));

      expect(labelOrder()).toEqual(['Alfa', 'Beta', 'Gama']);
      expect(screen.getByRole('columnheader', { name: /Štítek/ })).toHaveAttribute(
        'aria-sort',
        'ascending'
      );
    });

    it('starts a newly picked numeric column ascending, not descending', async () => {
      const user = userEvent.setup();
      renderTable();

      await user.click(screen.getByRole('button', { name: /Počet/ }));

      expect(labelOrder()).toEqual(['Beta', 'Alfa', 'Gama']);
      expect(screen.getByRole('columnheader', { name: /Počet/ })).toHaveAttribute(
        'aria-sort',
        'ascending'
      );
    });

    it('sorts numbers numerically, not as strings', async () => {
      const user = userEvent.setup();
      renderTable();

      await user.click(screen.getByRole('button', { name: /Počet/ }));

      // Lexicographically "10" < "2"; numerically 2 < 10 < 30.
      expect(labelOrder()).toEqual(['Beta', 'Alfa', 'Gama']);
    });

    it('moves the sort to another column and resets it to ascending', async () => {
      const user = userEvent.setup();
      renderTable();

      await user.click(screen.getByRole('button', { name: /Štítek/ }));
      await user.click(screen.getByRole('button', { name: /Štítek/ }));
      await user.click(screen.getByRole('button', { name: /Počet/ }));

      expect(screen.getByRole('columnheader', { name: /Počet/ })).toHaveAttribute(
        'aria-sort',
        'ascending'
      );
      expect(screen.getByRole('columnheader', { name: /Štítek/ })).toHaveAttribute(
        'aria-sort',
        'none'
      );
    });

    it('puts null values last when ascending', async () => {
      const user = userEvent.setup();
      renderTable({
        columns: [
          { id: 'label', header: 'Štítek', cell: (row) => row.label },
          {
            id: 'note',
            header: 'Poznámka',
            cell: (row) => row.note ?? '—',
            sortValue: (row) => row.note,
          },
        ],
      });

      await user.click(screen.getByRole('button', { name: /Poznámka/ }));

      // 'aaa' < 'bbb' < null.
      expect(labelOrder()).toEqual(['Alfa', 'Beta', 'Gama']);
    });

    it('applies defaultSort before any interaction', () => {
      renderTable({ defaultSort: { columnId: 'label', direction: 'desc' } });

      expect(labelOrder()).toEqual(['Gama', 'Beta', 'Alfa']);
      expect(screen.getByRole('columnheader', { name: /Štítek/ })).toHaveAttribute(
        'aria-sort',
        'descending'
      );
    });

    it('is reachable and operable from the keyboard', async () => {
      const user = userEvent.setup();
      renderTable();

      await user.tab();
      expect(screen.getByRole('button', { name: /Štítek/ })).toHaveFocus();

      await user.keyboard('{Enter}');
      expect(labelOrder()).toEqual(['Alfa', 'Beta', 'Gama']);
    });

    it('keeps multi-sort off — a shift-click on a second column replaces the sort, it does not add to it', () => {
      renderTable();

      fireEvent.click(screen.getByRole('button', { name: /Štítek/ }));
      fireEvent.click(screen.getByRole('button', { name: /Počet/ }), { shiftKey: true });

      // With `enableMultiSort` left off, TanStack treats the shift-click like
      // a plain one and replaces the sort outright. Were it on, the shift
      // press would append a second criterion instead — this component only
      // ever reports `next[0]`, so the sort would stay on `label` and this
      // header would never pick it up.
      expect(screen.getByRole('columnheader', { name: /Počet/ })).toHaveAttribute(
        'aria-sort',
        'ascending'
      );
      expect(labelOrder()).toEqual(['Beta', 'Alfa', 'Gama']);
    });
  });

  describe('controlled sorting', () => {
    it('reports the requested sort without applying it itself', async () => {
      const user = userEvent.setup();
      const onSortChange = jest.fn();
      renderTable({ sort: null, onSortChange });

      await user.click(screen.getByRole('button', { name: /Štítek/ }));

      expect(onSortChange).toHaveBeenCalledWith({ columnId: 'label', direction: 'asc' });
      // The caller did not move `sort`, so the order must not have moved either.
      expect(labelOrder()).toEqual(['Beta', 'Gama', 'Alfa']);
    });

    it('keeps reporting the same request while the caller holds sort still', async () => {
      const user = userEvent.setup();
      const onSortChange = jest.fn();
      renderTable({ sort: null, onSortChange });

      await user.click(screen.getByRole('button', { name: /Štítek/ }));
      await user.click(screen.getByRole('button', { name: /Štítek/ }));

      // Both presses are computed from the caller's `sort`, so neither drifts
      // into a direction the caller never asked for.
      expect(onSortChange).toHaveBeenCalledTimes(2);
      expect(onSortChange).toHaveBeenNthCalledWith(1, { columnId: 'label', direction: 'asc' });
      expect(onSortChange).toHaveBeenNthCalledWith(2, { columnId: 'label', direction: 'asc' });
      expect(labelOrder()).toEqual(['Beta', 'Gama', 'Alfa']);
    });

    it('follows the caller when the sort prop moves', () => {
      const { rerender } = renderTable({ sort: { columnId: 'label', direction: 'asc' } });

      expect(labelOrder()).toEqual(['Alfa', 'Beta', 'Gama']);

      rerender(
        <DataTable
          title="Položky"
          columns={COLUMNS}
          data={ITEMS}
          getRowId={(row) => row.id}
          emptyTitle="Žádná data"
          sort={{ columnId: 'label', direction: 'desc' }}
        />
      );

      expect(labelOrder()).toEqual(['Gama', 'Beta', 'Alfa']);
    });

    it('renders the ordering the caller supplies', () => {
      renderTable({ sort: { columnId: 'count', direction: 'desc' } });

      expect(labelOrder()).toEqual(['Gama', 'Alfa', 'Beta']);
      expect(screen.getByRole('columnheader', { name: /Počet/ })).toHaveAttribute(
        'aria-sort',
        'descending'
      );
    });

    it('also reports the sort in uncontrolled mode', async () => {
      const user = userEvent.setup();
      const onSortChange = jest.fn();
      renderTable({ onSortChange });

      await user.click(screen.getByRole('button', { name: /Štítek/ }));

      expect(onSortChange).toHaveBeenCalledWith({ columnId: 'label', direction: 'asc' });
      expect(labelOrder()).toEqual(['Alfa', 'Beta', 'Gama']);
    });

    it('does not carry a controlled press into internal state across a handoff to uncontrolled', async () => {
      const user = userEvent.setup();
      const { rerender } = renderTable({ sort: null, onSortChange: jest.fn() });

      // A controlled press only reports; it must not be applied.
      await user.click(screen.getByRole('button', { name: /Štítek/ }));
      expect(labelOrder()).toEqual(['Beta', 'Gama', 'Alfa']);

      // The caller drops `sort` entirely: the table becomes uncontrolled and
      // now renders `internalSort`. That must still be whatever `defaultSort`
      // left it at (nothing, here) — not whatever the controlled press above
      // reported, which the internal-state guard never wrote.
      rerender(
        <DataTable
          title="Položky"
          columns={COLUMNS}
          data={ITEMS}
          getRowId={(row) => row.id}
          emptyTitle="Žádná data"
        />
      );

      expect(labelOrder()).toEqual(['Beta', 'Gama', 'Alfa']);
    });

    it('does not re-render when a controlled press is one the caller ignores', async () => {
      const user = userEvent.setup();
      let cellRenders = 0;
      const columns: DataTableColumn<Item>[] = [
        {
          id: 'label',
          header: 'Štítek',
          cell: (row) => {
            cellRenders += 1;
            return row.label;
          },
          sortValue: (row) => row.label,
        },
      ];
      renderTable({ columns, sort: null, onSortChange: jest.fn() });

      const before = cellRenders;
      await user.click(screen.getByRole('button', { name: /Štítek/ }));

      // The caller never moved `sort`, so this must be a no-op render: the
      // internal-state guard exists precisely to avoid the wasted render pass
      // that would otherwise re-invoke every cell renderer.
      expect(cellRenders).toBe(before);
    });
  });

  describe('empty state', () => {
    it("shows the caller's title when there are no rows", () => {
      renderTable({ data: [], emptyTitle: 'Žádná data' });

      expect(screen.getByText('Žádná data')).toBeInTheDocument();
    });

    it('renders no body rows, only the header row and the empty cell', () => {
      renderTable({ data: [] });

      expect(screen.getAllByRole('row')).toHaveLength(2);
      expect(screen.queryByRole('cell', { name: 'Beta' })).not.toBeInTheDocument();
    });

    it('spans the empty cell across every column', () => {
      const { container } = renderTable({ data: [] });

      expect(container.querySelector('tbody td')).toHaveAttribute('colspan', '3');
    });

    it('uses the supplied title, description and action', () => {
      renderTable({
        data: [],
        emptyTitle: 'Nic tu není',
        emptyDescription: 'Zkuste jiný filtr.',
        emptyAction: <button type="button">Přidat</button>,
      });

      expect(screen.getByText('Nic tu není')).toBeInTheDocument();
      expect(screen.getByText('Zkuste jiný filtr.')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Přidat' })).toBeInTheDocument();
      expect(screen.queryByText('Žádná data')).not.toBeInTheDocument();
    });

    it('keeps the column headers visible so the shape of the table is still readable', () => {
      renderTable({ data: [] });

      expect(screen.getByRole('columnheader', { name: /Štítek/ })).toBeInTheDocument();
    });

    it('renders its EmptyState at the compact "sm" size, not the roomy default', () => {
      renderTable({ data: [] });

      const emptyStateRoot = screen.getByText('Žádná data').closest('div');

      expect(emptyStateRoot).toHaveClass('py-8');
      expect(emptyStateRoot).not.toHaveClass('py-16');
    });
  });
});
