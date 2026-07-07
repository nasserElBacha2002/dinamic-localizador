import { Button, Group, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DataTable, type DataTableColumn } from "../../design-system/components/DataTable";
import { PaginationControls } from "../../design-system/components/PaginationControls";
import { mapApiPaginationMeta } from "../../design-system/components/pagination-meta";
import { StatusBadge } from "../../design-system/components/StatusBadge";
import type { PaginationMeta } from "../../types/api";
import type { OperationAttendanceSummaryEmployee } from "../../types/operation-attendance-summary";
import { formatTime } from "../../utils/dates";
import { getRelatedName, safeText } from "../../utils/display-safe";
import {
  assignmentConfirmationStatusTableLabels,
  employeeTypeLabels,
  operationalAttendanceStatusTableLabels,
} from "../../utils/labels";
import {
  assignmentConfirmationStatusTone,
  operationalStatusTone,
} from "../../utils/attendance-status-tones";
import {
  formatOperationalCheckInCell,
  formatOperationalCheckOutCell,
} from "../../utils/operation-workforce-display";
import { navigateWithListContext } from "../../utils/list-navigation";

export interface OperationEmployeeTableProps {
  operationId: string;
  rows: OperationAttendanceSummaryEmployee[];
  scheduledStart: string | null;
  loading?: boolean;
  error?: string;
  canAssign: boolean;
  canReviewAttendance: (row: OperationAttendanceSummaryEmployee) => boolean;
  onReviewApprove: (attendanceId: string) => void;
  onReviewReject: (attendanceId: string) => void;
  onUnassign: (assignmentId: string) => void;
  unassignPending?: boolean;
  pagination?: {
    meta: PaginationMeta;
    pageSize: number;
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number) => void;
  };
  emptyTitle: string;
  emptyDescription: string;
}

export function OperationEmployeeTable({
  operationId,
  rows,
  scheduledStart,
  loading = false,
  error,
  canAssign,
  canReviewAttendance,
  onReviewApprove,
  onReviewReject,
  onUnassign,
  unassignPending = false,
  pagination,
  emptyTitle,
  emptyDescription,
}: OperationEmployeeTableProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const operationDetailPath = `/operations/${operationId}`;
  const expectedArrivalTime = scheduledStart ? formatTime(scheduledStart) : "—";

  const columns = useMemo<DataTableColumn<OperationAttendanceSummaryEmployee>[]>(
    () => [
      {
        key: "employee",
        header: "Colaborador",
        width: 180,
        render: (row) => (
          <Stack gap={2}>
            <Text size="sm" fw={500}>
              {getRelatedName(row.employee)}
            </Text>
            <Text size="xs" c="dimmed">
              {safeText(row.employee?.phoneNumber ?? null)}
            </Text>
          </Stack>
        ),
      },
      {
        key: "employeeType",
        header: "Tipo",
        width: 90,
        getValue: (row) =>
          row.employee?.employeeType ? employeeTypeLabels[row.employee.employeeType] : "—",
      },
      {
        key: "confirmation",
        header: "Confirmación",
        width: 120,
        render: (row) => (
          <StatusBadge
            label={assignmentConfirmationStatusTableLabels[row.confirmationStatus]}
            tone={assignmentConfirmationStatusTone(row.confirmationStatus)}
          />
        ),
      },
      {
        key: "expected",
        header: "Hora esperada",
        width: 100,
        getValue: () => expectedArrivalTime,
      },
      {
        key: "checkIn",
        header: "Check-in",
        width: 110,
        render: (row) => formatOperationalCheckInCell(row.attendance),
      },
      {
        key: "checkOut",
        header: "Check-out",
        width: 120,
        render: (row) => formatOperationalCheckOutCell(row.attendance),
      },
      {
        key: "attendanceStatus",
        header: "Estado asistencia",
        width: 130,
        render: (row) => (
          <StatusBadge
            label={operationalAttendanceStatusTableLabels[row.operationalStatus]}
            tone={operationalStatusTone(row.operationalStatus)}
          />
        ),
      },
    ],
    [expectedArrivalTime],
  );

  return (
    <DataTable
      rows={rows}
      columns={columns}
      getRowKey={(row) => row.assignmentId}
      loading={loading}
      error={error}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      onRowClick={(row) => {
        if (!row.attendance) {
          return;
        }

        navigateWithListContext(
          navigate,
          `/attendance/${row.attendance.id}`,
          operationDetailPath,
          location,
        );
      }}
      isRowClickable={(row) => Boolean(row.attendance)}
      rowActions={(row) => (
        <Group gap="xs" justify="flex-end" wrap="nowrap">
          {canReviewAttendance(row) ? (
            <>
              <Button
                size="compact-sm"
                onClick={() => onReviewApprove(row.attendance!.id)}
              >
                Aprobar
              </Button>
              <Button
                size="compact-sm"
                color="danger"
                variant="default"
                onClick={() => onReviewReject(row.attendance!.id)}
              >
                Rechazar
              </Button>
            </>
          ) : null}
          {canAssign && !row.attendance ? (
            <Button
              size="compact-sm"
              color="danger"
              variant="light"
              disabled={unassignPending}
              loading={unassignPending}
              onClick={() => onUnassign(row.assignmentId)}
            >
              Quitar asignación
            </Button>
          ) : null}
        </Group>
      )}
      pagination={
        pagination ? (
          <PaginationControls
            meta={mapApiPaginationMeta(pagination.meta)}
            pageSize={pagination.pageSize}
            onPageChange={pagination.onPageChange}
            onPageSizeChange={pagination.onPageSizeChange}
            showPageSizeSelector
          />
        ) : null
      }
      aria-label="Vista operativa de colaboradores"
    />
  );
}
