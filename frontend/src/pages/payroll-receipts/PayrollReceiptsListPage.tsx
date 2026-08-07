import { useMemo, useState } from "react";
import { Button, TextInput } from "@mantine/core";
import { useLocation, useNavigate } from "react-router";
import { EntityLink } from "../../components/entity-link";
import { EmployeeMultiSelect } from "../../components/lookups/EntityMultiSelects";
import {
  DataTable,
  FilterBar,
  FilterSelect,
  mapApiPaginationMeta,
  PageHeader,
  PaginationControls,
  SearchInput,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { usePayrollReceipts } from "../../hooks/usePayrollReceipts";
import { useTableUrlState } from "../../hooks/useTableUrlState";
import type { PayrollReceiptListItem, PayrollReceiptStatus } from "../../types/payroll-receipt";
import { terminology } from "../../domain/terminology";
import { formatDateTime } from "../../utils/dates";
import { safeText } from "../../utils/display-safe";
import { getApiErrorMessage } from "../../utils/errors";
import { navigateWithListContext } from "../../utils/list-navigation";
import { hasPermission } from "../../utils/permissions";
import {
  formatCuilDisplay,
  formatPayrollPeriod,
  PAYROLL_MONTH_LABELS,
  payrollReceiptStatusLabels,
  payrollReceiptStatusTone,
} from "../../utils/payroll-receipt-labels";
import {
  parseOptionalYearMonth,
  PAYROLL_RECEIPTS_TABLE_DEFAULTS,
  PAYROLL_RECEIPTS_TABLE_FIELDS,
  shouldOmitPayrollReceiptsTableValue,
} from "./payroll-receipts-list-table-state";
import { UploadPayrollReceiptsDialog } from "./UploadPayrollReceiptsDialog";

const PAYROLL_RECEIPTS_LIST_PATH = "/payroll-receipts";

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

export function PayrollReceiptsListPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const permissionsQuery = useCompanyPermissions();
  const canUpload = hasPermission(
    permissionsQuery.data?.permissions,
    "payroll_receipts:upload",
  );
  const [uploadOpen, setUploadOpen] = useState(false);

  const table = useTableUrlState({
    defaults: PAYROLL_RECEIPTS_TABLE_DEFAULTS,
    fields: PAYROLL_RECEIPTS_TABLE_FIELDS,
    shouldOmitFromUrl: shouldOmitPayrollReceiptsTableValue,
  });

  const period = parseOptionalYearMonth(table.state.year, table.state.month);
  const apiStatus =
    table.state.status === "all" ? undefined : (table.state.status as PayrollReceiptStatus);

  const { data, isPending, isError, error } = usePayrollReceipts({
    page: table.page,
    limit: table.pageSize,
    year: period.year,
    month: period.month,
    status: apiStatus,
    employeeIds: table.state.employeeIds.length > 0 ? table.state.employeeIds : undefined,
    search: table.state.search.trim() || undefined,
    document: table.state.document.trim() || undefined,
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
        key: "employee",
        header: terminology.worker.singular,
        render: (row) =>
          row.employeeId ? (
            <EntityLink
              entityType="employee"
              entityId={row.employeeId}
              label={safeText(row.employeeName ?? null)}
            stopPropagation
          />
          ) : (
            safeText(row.employeeName ?? null)
          ),
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

  const mobileCard = useMemo<DataTableMobileCardConfig<PayrollReceiptListItem>>(
    () => ({
      title: (row) =>
        row.employeeId ? (
          <EntityLink
            entityType="employee"
            entityId={row.employeeId}
            label={safeText(row.employeeName ?? row.originalFilename)}
            stopPropagation
          />
        ) : (
          safeText(row.employeeName ?? row.originalFilename)
        ),
      status: (row) => (
        <StatusBadge
          label={payrollReceiptStatusLabels[row.status]}
          tone={payrollReceiptStatusTone(row.status)}
          variant="light"
        />
      ),
      fields: [
        {
          key: "period",
          label: "Período",
          getValue: (row) => formatPayrollPeriod(row.year, row.month),
          visibility: "always",
        },
        {
          key: "document",
          label: "CUIL",
          getValue: (row) => formatCuilDisplay(row.normalizedDocument ?? row.detectedDocument),
          visibility: "always",
        },
        {
          key: "filename",
          label: "Archivo",
          getValue: (row) => row.originalFilename,
          visibility: "expanded",
        },
        {
          key: "createdAt",
          label: "Cargado",
          getValue: (row) => formatDateTime(row.createdAt),
          visibility: "expanded",
        },
      ],
    }),
    [],
  );

  return (
    <>
      <PageHeader
        title="Recibos de sueldo"
        description="Consultá y cargá recibos de sueldo por período y colaborador."
        action={
          canUpload ? (
            <Button onClick={() => setUploadOpen(true)}>Agregar recibos</Button>
          ) : null
        }
      />

      {uploadOpen ? (
        <UploadPayrollReceiptsDialog opened onClose={() => setUploadOpen(false)} />
      ) : null}

      <FilterBar
        search={
          <SearchInput
            label="Buscar"
            placeholder="Nombre de archivo o colaborador"
            value={table.searchInput}
            onChange={table.setSearch}
            onSearch={table.commitSearch}
          />
        }
        activeFilterCount={table.activeFilterCount}
        onClearFilters={table.resetFilters}
      >
        <FilterBar.Item>
          <FilterSelect
            label="Año"
            value={table.state.year}
            onChange={(nextValue) => {
              table.setField("year", nextValue);
            }}
            data={yearOptions}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Mes"
            value={table.state.month}
            onChange={(nextValue) => {
              table.setField("month", nextValue);
            }}
            data={MONTH_OPTIONS}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Estado"
            value={table.state.status}
            onChange={(nextValue) => {
              table.setField("status", nextValue as typeof table.state.status);
            }}
            data={statusOptions}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <EmployeeMultiSelect
            label={terminology.worker.plural}
            value={table.state.employeeIds}
            onChange={(ids) => table.setField("employeeIds", ids)}
            activeOnly={false}
            maxVisibleChips={2}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <TextInput
            label="CUIL"
            placeholder="Ej. 20-12345678-9"
            value={table.state.document}
            onChange={(event) => table.setField("document", event.currentTarget.value)}
          />
        </FilterBar.Item>
      </FilterBar>

      <DataTable
        rows={data?.data ?? []}
        columns={columns}
        getRowKey={(row) => row.id}
        loading={isPending}
        error={isError ? getApiErrorMessage(error) : undefined}
        emptyTitle="No hay recibos de sueldo para los filtros seleccionados."
        emptyDescription="Ajustá los filtros o subí nuevos recibos."
        onRowClick={(row) =>
          navigateWithListContext(
            navigate,
            `/payroll-receipts/${row.id}`,
            PAYROLL_RECEIPTS_LIST_PATH,
            location,
          )
        }
        mobileView="cards"
        mobileCard={mobileCard}
        aria-label="Listado de recibos de sueldo"
        pagination={
          data && data.data.length > 0 ? (
            <PaginationControls
              meta={mapApiPaginationMeta(data.meta)}
              onPageChange={table.onPageChange}
              pageSize={table.pageSize}
              onPageSizeChange={table.onPageSizeChange}
              showPageSizeSelector
            />
          ) : undefined
        }
      />
    </>
  );
}
