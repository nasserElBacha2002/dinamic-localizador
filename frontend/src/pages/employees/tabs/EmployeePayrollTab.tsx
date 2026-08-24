import { Stack } from "@mantine/core";
import { useMemo, useState } from "react";
import {
  DataTable,
  FilterBar,
  FilterSelect,
  PaginationControls,
  SearchInput,
  StatusBadge,
  mapApiPaginationMeta,
  type DataTableColumn,
} from "../../../design-system";
import { usePayrollReceipts } from "../../../hooks/usePayrollReceipts";
import type { PayrollReceiptListItem, PayrollReceiptStatus } from "../../../types/payroll-receipt";
import { formatDateTime } from "../../../utils/dates";
import { getApiErrorMessage } from "../../../utils/errors";
import {
  formatCuilDisplay,
  formatPayrollPeriod,
  PAYROLL_MONTH_LABELS,
  payrollReceiptStatusLabels,
  payrollReceiptStatusTone,
} from "../../../utils/payroll-receipt-labels";
import { parseOptionalYearMonth } from "../../payroll-receipts/payroll-receipts-list-table-state";

interface EmployeePayrollTabProps {
  employeeId: string;
}

function buildYearOptions(): Array<{ value: string; label: string }> {
  const current = new Date().getFullYear();
  const years: Array<{ value: string; label: string }> = [{ value: "", label: "Todos" }];
  for (let year = current + 1; year >= current - 10; year -= 1) {
    years.push({ value: String(year), label: String(year) });
  }
  return years;
}

const MONTH_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Todos" },
  ...Object.entries(PAYROLL_MONTH_LABELS).map(([value, label]) => ({ value, label })),
];

export function EmployeePayrollTab({ employeeId }: EmployeePayrollTabProps) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [year, setYear] = useState("");
  const [month, setMonth] = useState("");
  const [status, setStatus] = useState<"all" | PayrollReceiptStatus>("all");
  const [search, setSearch] = useState("");

  const period = parseOptionalYearMonth(year, month);
  const apiStatus = status === "all" ? undefined : status;

  const query = usePayrollReceipts({
    page,
    limit: pageSize,
    year: period.year,
    month: period.month,
    status: apiStatus,
    employeeIds: [employeeId],
    search: search.trim() || undefined,
  });

  const yearOptions = useMemo(() => buildYearOptions(), []);
  const statusOptions = useMemo(
    () => [
      { value: "all", label: "Todos" },
      ...Object.entries(payrollReceiptStatusLabels).map(([value, label]) => ({ value, label })),
    ],
    [],
  );

  const columns = useMemo<DataTableColumn<PayrollReceiptListItem>[]>(
    () => [
      {
        key: "period",
        header: "Período",
        getValue: (row) => formatPayrollPeriod(row.year, row.month),
      },
      {
        key: "document",
        header: "CUIL",
        getValue: (row) => formatCuilDisplay(row.normalizedDocument ?? row.detectedDocument),
      },
      {
        key: "filename",
        header: "Archivo",
        getValue: (row) => row.originalFilename,
      },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={payrollReceiptStatusLabels[row.status]}
            tone={payrollReceiptStatusTone(row.status)}
            variant="light"
          />
        ),
      },
      {
        key: "createdAt",
        header: "Cargado",
        getValue: (row) => formatDateTime(row.createdAt),
      },
    ],
    [],
  );

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta
    ? mapApiPaginationMeta(query.data.meta)
    : { page, pageSize, totalItems: 0, totalPages: 0 };

  return (
    <Stack gap="md">
      <FilterBar
        search={
          <SearchInput
            label="Buscar"
            placeholder="Nombre de archivo"
            value={search}
            onChange={setSearch}
            onSearch={() => setPage(1)}
          />
        }
        activeFilterCount={
          (year ? 1 : 0) + (month ? 1 : 0) + (status !== "all" ? 1 : 0)
        }
        onClearFilters={() => {
          setYear("");
          setMonth("");
          setStatus("all");
          setSearch("");
          setPage(1);
        }}
      >
        <FilterBar.Item>
          <FilterSelect label="Año" value={year} onChange={setYear} data={yearOptions} />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect label="Mes" value={month} onChange={setMonth} data={MONTH_OPTIONS} />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Estado"
            value={status}
            onChange={(value) => setStatus(value as typeof status)}
            data={statusOptions}
          />
        </FilterBar.Item>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        loading={query.isPending}
        error={
          query.isError ? getApiErrorMessage(query.error, "No se pudieron cargar los recibos.") : undefined
        }
        emptyTitle="Sin recibos"
        emptyDescription="No hay recibos de sueldo cargados para este colaborador."
        pagination={
          rows.length > 0 ? (
            <PaginationControls meta={meta} onPageChange={setPage} />
          ) : undefined
        }
      />
    </Stack>
  );
}
