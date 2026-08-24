import { Stack } from "@mantine/core";
import { useMemo, useState } from "react";
import { EntityLink } from "../../../components/entity-link";
import {
  DataTable,
  PaginationControls,
  SectionCard,
  StatusBadge,
  mapApiPaginationMeta,
  type DataTableColumn,
} from "../../../design-system";
import { useEmployeeOperations } from "../../../hooks/useEmployeeOperations";
import type { EmployeeAssignedOperation } from "../../../api/employees.api";
import { terminology } from "../../../domain/terminology";
import { formatDateTime } from "../../../utils/dates";
import { getApiErrorMessage } from "../../../utils/errors";
import {
  assignmentConfirmationStatusTableLabels,
  operationStatusLabels,
  punctualityStatusLabels,
} from "../../../utils/labels";
import type { OperationStatus } from "../../../types/operation";
import type { AssignmentConfirmationStatus } from "../../../types/assignment-confirmation";
import type { PunctualityStatus } from "../../../types/attendance";

interface EmployeeOperationsTabProps {
  employeeId: string;
  enabled: boolean;
}

function useOperationColumns(includeAttendance: boolean) {
  return useMemo<DataTableColumn<EmployeeAssignedOperation>[]>(() => {
    const base: DataTableColumn<EmployeeAssignedOperation>[] = [
      {
        key: "service",
        header: terminology.service.singular,
        getValue: (row) => row.serviceName,
      },
      {
        key: "operation",
        header: terminology.operation.singular,
        render: (row) => (
          <EntityLink
            entityType="operation"
            entityId={row.operationId}
            label={formatDateTime(row.scheduledStart)}
            stopPropagation
          />
        ),
      },
      {
        key: "schedule",
        header: "Horario",
        getValue: (row) =>
          `${formatDateTime(row.scheduledStart)} – ${formatDateTime(row.scheduledEnd)}`,
      },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={
              operationStatusLabels[row.operationStatus as OperationStatus] ??
              row.operationStatus
            }
            tone="neutral"
          />
        ),
      },
      {
        key: "participation",
        header: "Participación",
        render: (row) => (
          <StatusBadge
            label={
              assignmentConfirmationStatusTableLabels[
                row.confirmationStatus as AssignmentConfirmationStatus
              ] ?? row.confirmationStatus
            }
            tone="neutral"
            variant="light"
          />
        ),
      },
    ];

    if (!includeAttendance) {
      return base;
    }

    return [
      ...base,
      {
        key: "checkIn",
        header: "Llegada",
        getValue: (row) => formatDateTime(row.attendanceReceivedAt),
      },
      {
        key: "attendance",
        header: "Asistencia",
        getValue: (row) =>
          row.punctualityStatus
            ? punctualityStatusLabels[row.punctualityStatus as PunctualityStatus]
            : row.attendanceReceivedAt
              ? "Registrada"
              : "—",
      },
    ];
  }, [includeAttendance]);
}

function OperationsTableSection({
  title,
  employeeId,
  segment,
  enabled,
  includeAttendance,
  emptyTitle,
  emptyDescription,
}: {
  title: string;
  employeeId: string;
  segment: "active" | "past";
  enabled: boolean;
  includeAttendance: boolean;
  emptyTitle: string;
  emptyDescription: string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const columns = useOperationColumns(includeAttendance);

  const query = useEmployeeOperations(
    employeeId,
    { segment, page, limit: pageSize },
    enabled,
  );

  const rows = query.data?.data ?? [];
  const meta = query.data?.meta
    ? mapApiPaginationMeta(query.data.meta)
    : { page, pageSize, totalItems: 0, totalPages: 0 };

  return (
    <SectionCard title={title}>
      <Stack gap="sm">
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.assignmentId}
          loading={query.isPending}
          error={
            query.isError
              ? getApiErrorMessage(query.error, "No se pudieron cargar las operaciones.")
              : undefined
          }
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
          pagination={
            rows.length > 0 ? (
              <PaginationControls meta={meta} onPageChange={setPage} />
            ) : undefined
          }
        />
      </Stack>
    </SectionCard>
  );
}

export function EmployeeOperationsTab({ employeeId, enabled }: EmployeeOperationsTabProps) {
  return (
    <Stack gap="md">
      <OperationsTableSection
        title="Operaciones activas"
        employeeId={employeeId}
        segment="active"
        enabled={enabled}
        includeAttendance={false}
        emptyTitle="Sin operaciones activas"
        emptyDescription={`Este ${terminology.worker.singular.toLowerCase()} no tiene operaciones vigentes o futuras asignadas.`}
      />
      <OperationsTableSection
        title="Operaciones pasadas"
        employeeId={employeeId}
        segment="past"
        enabled={enabled}
        includeAttendance
        emptyTitle="Sin operaciones pasadas"
        emptyDescription={`Todavía no hay operaciones finalizadas registradas para este ${terminology.worker.singular.toLowerCase()}.`}
      />
    </Stack>
  );
}
