import { Stack } from "@mantine/core";
import { useMemo, useState } from "react";
import { EntityLink } from "../../../components/entity-link";
import { AttendanceStatusBadge } from "../../../components/attendance/AttendanceStatusBadge";
import { AttendanceListEventStatusCell } from "../../../components/attendance/AttendanceListEventStatusCell";
import {
  DataTable,
  FilterBar,
  FilterDateRangeInput,
  FilterSelect,
  PaginationControls,
  mapApiPaginationMeta,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../../design-system";
import { useAttendanceRecords } from "../../../hooks/useAttendance";
import type {
  AttendanceRecordWithRelations,
  LocationStatus,
  PunctualityStatus,
  ValidationStatus,
} from "../../../types/attendance";
import { terminology } from "../../../domain/terminology";
import { getDefaultStatisticsDateRange, getDateRangeQueryValue } from "../../../utils/date-range";
import { dateInputToIsoEnd, dateInputToIsoStart, formatDateTime } from "../../../utils/dates";
import { formatAttendanceArrivalLabel } from "../../../utils/attendance-display";
import { formatDistanceMeters, getRelatedName } from "../../../utils/display-safe";
import { getApiErrorMessage } from "../../../utils/errors";
import {
  attendanceListEventStatusesLabel,
  attendanceListLocationEvents,
  attendanceListPunctualityEvents,
  attendanceListValidationLabel,
  attendanceListValidationTone,
} from "../../../utils/attendance-list-display";
import {
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../../utils/labels";
import type { DateRangeValue } from "../../../types/date-range";

interface EmployeeAttendanceTabProps {
  employeeId: string;
}

export function EmployeeAttendanceTab({ employeeId }: EmployeeAttendanceTabProps) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [dateRange, setDateRange] = useState<DateRangeValue>(() =>
    getDefaultStatisticsDateRange(),
  );
  const [validationStatus, setValidationStatus] = useState("");
  const [locationStatus, setLocationStatus] = useState("");
  const [punctualityStatus, setPunctualityStatus] = useState("");

  const dateQuery = getDateRangeQueryValue(dateRange);
  const filters = {
    page,
    limit: pageSize,
    employeeIds: [employeeId],
    validationStatus: (validationStatus as ValidationStatus) || undefined,
    locationStatus: (locationStatus as LocationStatus) || undefined,
    punctualityStatus: (punctualityStatus as PunctualityStatus) || undefined,
    dateFrom: dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined,
    dateTo: dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined,
  };

  const query = useAttendanceRecords(filters);

  const columns = useMemo<DataTableColumn<AttendanceRecordWithRelations>[]>(
    () => [
      {
        key: "operation",
        header: terminology.operation.singular,
        render: (row) => (
          <EntityLink
            entityType="operation"
            entityId={row.operationId}
            label={formatDateTime(row.operation?.scheduledStart)}
            stopPropagation
          />
        ),
      },
      {
        key: "service",
        header: terminology.service.singular,
        render: (row) => (
          <EntityLink
            entityType="service"
            entityId={row.service?.id}
            label={getRelatedName(row.service)}
            stopPropagation
          />
        ),
      },
      { key: "receivedAt", header: "Llegada", getValue: (row) => formatAttendanceArrivalLabel(row.receivedAt, formatDateTime) },
      { key: "checkoutAt", header: "Salida", getValue: (row) => formatDateTime(row.checkoutAt) },
      {
        key: "distance",
        header: "Distancia",
        getValue: (row) => formatDistanceMeters(row.distanceMeters),
      },
      {
        key: "validationStatus",
        header: "Validación",
        render: (row) => (
          <AttendanceStatusBadge
            label={attendanceListValidationLabel(row)}
            tone={attendanceListValidationTone(row)}
          />
        ),
      },
      {
        key: "locationStatus",
        header: "Ubicación",
        getValue: (row) => attendanceListEventStatusesLabel(attendanceListLocationEvents(row)),
        render: (row) => <AttendanceListEventStatusCell events={attendanceListLocationEvents(row)} />,
      },
      {
        key: "punctualityStatus",
        header: "Puntualidad",
        getValue: (row) => attendanceListEventStatusesLabel(attendanceListPunctualityEvents(row)),
        render: (row) => (
          <AttendanceListEventStatusCell events={attendanceListPunctualityEvents(row)} />
        ),
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<AttendanceRecordWithRelations>>(
    () => ({
      title: (row) => formatAttendanceArrivalLabel(row.receivedAt, formatDateTime),
      status: (row) => (
        <AttendanceStatusBadge
          label={attendanceListValidationLabel(row)}
          tone={attendanceListValidationTone(row)}
        />
      ),
      fields: [
        {
          key: "operation",
          label: terminology.operation.singular,
          render: (row) => formatDateTime(row.operation?.scheduledStart),
          visibility: "always",
        },
        {
          key: "service",
          label: terminology.service.singular,
          getValue: (row) => getRelatedName(row.service),
          visibility: "always",
        },
      ],
    }),
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
          <FilterDateRangeInput
            value={dateRange}
            onChange={setDateRange}
            mode="past"
            label="Fecha"
            allowCustomRange
          />
        }
        activeFilterCount={
          (validationStatus ? 1 : 0) + (locationStatus ? 1 : 0) + (punctualityStatus ? 1 : 0)
        }
        onClearFilters={() => {
          setValidationStatus("");
          setLocationStatus("");
          setPunctualityStatus("");
          setDateRange(getDefaultStatisticsDateRange());
          setPage(1);
        }}
      >
        <FilterBar.Item>
          <FilterSelect
            label="Estado de validación"
            value={validationStatus}
            onChange={setValidationStatus}
            data={[
              { value: "", label: "Todas" },
              ...Object.entries(validationStatusLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Ubicación"
            value={locationStatus}
            onChange={setLocationStatus}
            data={[
              { value: "", label: "Todas" },
              ...Object.entries(locationStatusLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterBar.Item>
        <FilterBar.Item>
          <FilterSelect
            label="Puntualidad"
            value={punctualityStatus}
            onChange={setPunctualityStatus}
            data={[
              { value: "", label: "Todas" },
              ...Object.entries(punctualityStatusLabels).map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterBar.Item>
      </FilterBar>

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(row) => row.id}
        mobileView="cards"
        mobileCard={mobileCard}
        loading={query.isPending}
        error={
          query.isError
            ? getApiErrorMessage(query.error, "No se pudieron cargar las asistencias.")
            : undefined
        }
        emptyTitle="Sin registros en el período"
        emptyDescription={`No hay jornadas con asistencia registrada para este ${terminology.worker.singular.toLowerCase()}.`}
        pagination={
          rows.length > 0 ? (
            <PaginationControls meta={meta} onPageChange={setPage} />
          ) : undefined
        }
      />
    </Stack>
  );
}
