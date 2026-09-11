import type { DataTableSortValue } from './data-table';

/**
 * Orders two cell values.
 *
 * `null` sorts last in ascending order (and, because the direction is applied
 * by negating this result, first in descending order). Registered per column
 * rather than left to TanStack's automatic detection: auto-detection reads the
 * first non-null value to pick a comparator, so a column whose first rows
 * happen to be empty would silently get a different ordering than the same
 * column with the rows in another order.
 */
export function compareSortValues(a: DataTableSortValue, b: DataTableSortValue): number {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }

  return a < b ? -1 : 1;
}
