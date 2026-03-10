/**
 * DataTable Component
 *
 * A comprehensive data table component with support for:
 * - Sorting
 * - Pagination (cursor-based)
 * - Row selection
 * - Loading states
 * - Custom cell rendering
 */

import {
  useCallback,
  type ReactNode,
  type HTMLAttributes,
} from "react";
import { cn } from "../../lib/utils";
import { Checkbox } from "./input";
import { Spinner } from "./spinner";
import { Button } from "./button";

// Types
export type SortDirection = "asc" | "desc";

export interface SortState {
  column: string;
  direction: SortDirection;
}

export interface PaginationState {
  cursor: string | null;
  limit: number;
}

export interface ColumnDef<T> {
  id: string;
  header: ReactNode | ((props: { column: ColumnDef<T> }) => ReactNode);
  cell: (props: { row: T; rowIndex: number }) => ReactNode;
  accessorKey?: keyof T;
  sortable?: boolean;
  width?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  align?: "left" | "center" | "right";
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  loading?: boolean;
  // Sorting
  sorting?: SortState;
  onSortingChange?: (sorting: SortState) => void;
  // Pagination
  pagination?: PaginationState;
  onPaginationChange?: (pagination: PaginationState) => void;
  hasMore?: boolean;
  totalCount?: number;
  // Row selection
  selectable?: boolean;
  selectedRows?: Set<string>;
  onSelectionChange?: (selectedRows: Set<string>) => void;
  getRowId?: (row: T) => string;
  // Styling
  className?: string;
  tableClassName?: string;
  headerClassName?: string;
  rowClassName?: string | ((row: T, index: number) => string);
  striped?: boolean;
  hoverable?: boolean;
  bordered?: boolean;
  compact?: boolean;
  // Empty state
  emptyMessage?: ReactNode;
  emptyIcon?: ReactNode;
  // Row click
  onRowClick?: (row: T, index: number) => void;
}

// Default empty icon
const DefaultEmptyIcon = () => (
  <svg
    className="h-16 w-16 text-gray-300 dark:text-gray-600"
    fill="none"
    viewBox="0 0 64 64"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <rect x="8" y="12" width="48" height="40" rx="4" />
    <line x1="8" y1="24" x2="56" y2="24" />
    <line x1="24" y1="24" x2="24" y2="52" />
    <line x1="8" y1="32" x2="56" y2="32" />
    <line x1="8" y1="40" x2="56" y2="40" />
    <circle cx="32" cy="44" r="6" strokeDasharray="3 2" />
    <line x1="29" y1="44" x2="35" y2="44" />
  </svg>
);

// Sort icon component
function SortIcon({ direction }: { direction?: SortDirection }) {
  return (
    <span className="ml-1 inline-flex flex-col">
      <svg
        className={cn(
          "h-2 w-2",
          direction === "asc" ? "text-primary-600" : "text-gray-300"
        )}
        viewBox="0 0 8 5"
        fill="currentColor"
      >
        <path d="M4 0L8 5H0L4 0Z" />
      </svg>
      <svg
        className={cn(
          "h-2 w-2 -mt-0.5",
          direction === "desc" ? "text-primary-600" : "text-gray-300"
        )}
        viewBox="0 0 8 5"
        fill="currentColor"
      >
        <path d="M4 5L0 0H8L4 5Z" />
      </svg>
    </span>
  );
}

export function DataTable<T>({
  columns,
  data,
  loading = false,
  sorting,
  onSortingChange,
  pagination,
  onPaginationChange,
  hasMore = false,
  totalCount,
  selectable = false,
  selectedRows,
  onSelectionChange,
  getRowId = (row: T) => (row as { id?: string }).id ?? String(data.indexOf(row)),
  className,
  tableClassName,
  headerClassName,
  rowClassName,
  striped = false,
  hoverable = true,
  bordered = false,
  compact = false,
  emptyMessage = "No data available",
  emptyIcon,
  onRowClick,
}: DataTableProps<T>) {
  // Handle sort click
  const handleSort = useCallback(
    (columnId: string) => {
      if (!onSortingChange) return;

      if (sorting?.column === columnId) {
        onSortingChange({
          column: columnId,
          direction: sorting.direction === "asc" ? "desc" : "asc",
        });
      } else {
        onSortingChange({
          column: columnId,
          direction: "asc",
        });
      }
    },
    [sorting, onSortingChange]
  );

  // Handle row selection
  const handleSelectAll = useCallback(() => {
    if (!onSelectionChange) return;

    const allIds = new Set(data.map(getRowId));
    const allSelected = data.every((row) => selectedRows?.has(getRowId(row)));

    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(allIds);
    }
  }, [data, selectedRows, onSelectionChange, getRowId]);

  const handleSelectRow = useCallback(
    (row: T) => {
      if (!onSelectionChange || !selectedRows) return;

      const rowId = getRowId(row);
      const newSelection = new Set(selectedRows);

      if (newSelection.has(rowId)) {
        newSelection.delete(rowId);
      } else {
        newSelection.add(rowId);
      }

      onSelectionChange(newSelection);
    },
    [selectedRows, onSelectionChange, getRowId]
  );

  // Compute selection state
  const allSelected = data.length > 0 && data.every((row) => selectedRows?.has(getRowId(row)));
  const someSelected =
    data.some((row) => selectedRows?.has(getRowId(row))) && !allSelected;

  // Cell padding based on compact mode
  const cellPadding = compact ? "px-3 py-2" : "px-4 py-3";

  return (
    <div className={cn("relative overflow-hidden rounded-lg", className)}>
      <div className="overflow-x-auto">
        <table
          className={cn(
            "w-full divide-y divide-gray-200 dark:divide-gray-700",
            bordered && "border border-gray-200 dark:border-gray-700",
            tableClassName
          )}
        >
          <thead
            className={cn(
              "bg-gray-50 dark:bg-gray-800/50",
              headerClassName
            )}
          >
            <tr>
              {selectable && (
                <th scope="col" className={cn(cellPadding, "w-12")}>
                  <Checkbox
                    checked={allSelected}
                    ref={(el) => {
                      if (el) (el as HTMLInputElement).indeterminate = someSelected;
                    }}
                    onChange={handleSelectAll}
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {columns.map((column) => {
                const isSorted = sorting?.column === column.id;
                const sortDirection = isSorted ? sorting?.direction : undefined;

                return (
                  <th
                    key={column.id}
                    scope="col"
                    style={{
                      width: column.width,
                      minWidth: column.minWidth,
                      maxWidth: column.maxWidth,
                    }}
                    className={cn(
                      cellPadding,
                      "text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400",
                      column.align === "center" && "text-center",
                      column.align === "right" && "text-right",
                      column.sortable && "cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700",
                      column.headerClassName
                    )}
                    onClick={column.sortable ? () => handleSort(column.id) : undefined}
                  >
                    <span className="inline-flex items-center">
                      {typeof column.header === "function"
                        ? column.header({ column })
                        : column.header}
                      {column.sortable && <SortIcon direction={sortDirection} />}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {loading && data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Spinner size="lg" />
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Loading...
                    </span>
                  </div>
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="py-12 text-center"
                >
                  <div className="flex flex-col items-center gap-3">
                    {emptyIcon ?? <DefaultEmptyIcon />}
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {emptyMessage}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((row, rowIndex) => {
                const rowId = getRowId(row);
                const isSelected = selectedRows?.has(rowId);
                const computedRowClassName =
                  typeof rowClassName === "function"
                    ? rowClassName(row, rowIndex)
                    : rowClassName;

                return (
                  <tr
                    key={rowId}
                    className={cn(
                      "transition-colors",
                      striped && rowIndex % 2 === 1 && "bg-gray-50 dark:bg-gray-800/30",
                      hoverable && "hover:bg-gray-50 dark:hover:bg-gray-800/50",
                      isSelected && "bg-primary-50 dark:bg-primary-900/20",
                      onRowClick && "cursor-pointer",
                      computedRowClassName
                    )}
                    onClick={onRowClick ? () => onRowClick(row, rowIndex) : undefined}
                  >
                    {selectable && (
                      <td className={cellPadding} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          checked={isSelected}
                          onChange={() => handleSelectRow(row)}
                          aria-label={`Select row ${rowIndex + 1}`}
                        />
                      </td>
                    )}
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        style={{
                          width: column.width,
                          minWidth: column.minWidth,
                          maxWidth: column.maxWidth,
                        }}
                        className={cn(
                          cellPadding,
                          "text-sm text-gray-900 dark:text-gray-100",
                          column.align === "center" && "text-center",
                          column.align === "right" && "text-right",
                          column.className
                        )}
                      >
                        {column.cell({ row, rowIndex })}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Loading overlay for data refresh */}
      {loading && data.length > 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-gray-900/50">
          <Spinner size="lg" />
        </div>
      )}

      {/* Pagination */}
      {pagination && (
        <TablePagination
          hasMore={hasMore}
          totalCount={totalCount}
          currentCount={data.length}
          limit={pagination.limit}
          onLimitChange={(limit) =>
            onPaginationChange?.({ ...pagination, limit, cursor: null })
          }
          onLoadMore={() => {
            if (data.length > 0) {
              const lastRow = data[data.length - 1];
              const cursor = getRowId(lastRow);
              onPaginationChange?.({ ...pagination, cursor });
            }
          }}
          loading={loading}
        />
      )}
    </div>
  );
}

/**
 * TablePagination Component
 */
interface TablePaginationProps {
  hasMore: boolean;
  totalCount?: number;
  currentCount: number;
  limit: number;
  onLimitChange: (limit: number) => void;
  onLoadMore: () => void;
  loading?: boolean;
}

function TablePagination({
  hasMore,
  totalCount,
  currentCount,
  limit,
  onLimitChange,
  onLoadMore,
  loading,
}: TablePaginationProps) {
  const limitOptions = [10, 25, 50, 100];

  return (
    <div className="flex items-center justify-between border-t border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center gap-2">
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Showing {currentCount}
          {totalCount !== undefined && ` of ${totalCount}`} items
        </span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label
            htmlFor="data-table-limit"
            className="text-sm text-gray-500 dark:text-gray-400"
          >
            Per page:
          </label>
          <select
            id="data-table-limit"
            value={limit}
            onChange={(e) => onLimitChange(Number(e.target.value))}
            className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:border-gray-600 dark:bg-gray-800"
          >
            {limitOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>

        {hasMore && (
          <Button
            variant="outline"
            size="sm"
            onClick={onLoadMore}
            loading={loading}
          >
            Load More
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Simple Table Components for custom tables
 */
export interface TableProps extends HTMLAttributes<HTMLTableElement> {
  bordered?: boolean;
}

export function Table({ bordered, className, ...props }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table
        className={cn(
          "w-full divide-y divide-gray-200 dark:divide-gray-700",
          bordered && "border border-gray-200 dark:border-gray-700",
          className
        )}
        {...props}
      />
    </div>
  );
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead
      className={cn("bg-gray-50 dark:bg-gray-800/50", className)}
      {...props}
    />
  );
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody
      className={cn(
        "divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900",
        className
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr
      className={cn("transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50", className)}
      {...props}
    />
  );
}

export function TableHeader({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400",
        className
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-sm text-gray-900 dark:text-gray-100",
        className
      )}
      {...props}
    />
  );
}
