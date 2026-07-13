import { Button, Menu, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DataTable, type DataTableColumn } from "../../design-system/components/DataTable";
import { PaginationControls } from "../../design-system/components/PaginationControls";
import { mapApiPaginationMeta } from "../../design-system/components/pagination-meta";
import { StatusBadge } from "../../design-system/components/StatusBadge";
import type { PaginationMeta } from "../../types/api";
import type { OperationAttendanceSummaryEmployee } from "../../types/operation-attendance-summary";
import type { OperationEmployeeAssignment } from "../../types/operation";
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
import {
  assignmentActionLabel,
  resolveAssignmentAction,
} from "./operation-assignment-display";

function buildEmployeeSecondaryLine(
  row: OperationAttendanceSummaryEmployee,
  assignment?: OperationEmployeeAssignment,
): string {
  const parts: string[] = [];
  if (row.employee?.employeeType) {
    parts.push(employeeTypeLabels[row.employee.employeeType]);
  }
  if (assignment?.assignmentOrigin === "WORK_TEAM" && assignment.sourceWorkTeamName) {
    parts.push(assignment.sourceWorkTeamName);
  }
  const phone = safeText(row.employee?.phoneNumber ?? null);
  if (phone !== "—") {
    parts.push(phone);
  }
  return parts.join(" · ");
}

export interface OperationEmployeeTableProps {
  operationId: string;
  rows: OperationAttendanceSummaryEmployee[];
  loading?: boolean;
  error?: string;
  canAssign: boolean;
  canReviewAttendance: (row: OperationAttendanceSummaryEmployee) => boolean;
  assignmentById?: Map<string, OperationEmployeeAssignment>;
  operationWorkDate?: string;
  onReviewApprove: (attendanceId: string) => void;
  onReviewReject: (attendanceId: string) => void;
  onCancelAssignment: (assignment: OperationEmployeeAssignment) => void;
  onEndAssignment: (assignment: OperationEmployeeAssignment) => void;
  cancelPending?: boolean;
  endPending?: boolean;
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
  loading = false,
  error,
  canAssign,
  canReviewAttendance,
  assignmentById,
  operationWorkDate = "",
  onReviewApprove,
  onReviewReject,
  onCancelAssignment,
  onEndAssignment,
  cancelPending = false,
  endPending = false,
  pagination,
  emptyTitle,
  emptyDescription,
}: OperationEmployeeTableProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const operationDetailPath = `/operations/${operationId}`;

  const columns = useMemo<DataTableColumn<OperationAttendanceSummaryEmployee>[]>(
    () => [
      {
        key: "employee",
        header: "Colaborador",
        width: 200,
        render: (row) => {
          const assignment = assignmentById?.get(row.assignmentId);
          const secondary = buildEmployeeSecondaryLine(row, assignment);
          return (
            <Stack gap={2}>
              <Text size="sm" fw={500}>
                {getRelatedName(row.employee)}
              </Text>
              {secondary ? (
                <Text size="xs" c="dimmed">
                  {secondary}
                </Text>
              ) : null}
            </Stack>
          );
        },
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
        key: "attendanceStatus",
        header: "Asistencia",
        width: 120,
        render: (row) => (
          <StatusBadge
            label={operationalAttendanceStatusTableLabels[row.operationalStatus]}
            tone={operationalStatusTone(row.operationalStatus)}
          />
        ),
      },
      {
        key: "checkIn",
        header: "Check-in",
        width: 100,
        render: (row) => formatOperationalCheckInCell(row.attendance),
      },
      {
        key: "checkOut",
        header: "Check-out",
        width: 110,
        render: (row) => formatOperationalCheckOutCell(row.attendance),
      },
    ],
    [assignmentById],
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
      rowActions={(row) => {
        const assignment = assignmentById?.get(row.assignmentId);
        const hasAttendanceDetail = Boolean(row.attendance);
        const resolvedAction =
          canAssign && assignment
            ? resolveAssignmentAction(assignment, operationWorkDate)
            : null;
        // Never offer destructive removal for a row with attendance: the backend
        // rejects it (ASSIGNMENT_HAS_ATTENDANCE_RECORDS) to preserve history.
        const assignmentAction =
          hasAttendanceDetail &&
          (resolvedAction === "cancel-current" || resolvedAction === "cancel-future")
            ? null
            : resolvedAction;
        const canReview = canReviewAttendance(row);

        if (!canReview && !assignmentAction && !hasAttendanceDetail) {
          return null;
        }

        return (
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button size="compact-xs" variant="subtle">
                Acciones
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              {hasAttendanceDetail ? (
                <Menu.Item
                  onClick={() =>
                    navigateWithListContext(
                      navigate,
                      `/attendance/${row.attendance!.id}`,
                      operationDetailPath,
                      location,
                    )
                  }
                >
                  Ver detalle
                </Menu.Item>
              ) : null}
              {canReview ? (
                <>
                  <Menu.Item onClick={() => onReviewApprove(row.attendance!.id)}>
                    Aprobar asistencia
                  </Menu.Item>
                  <Menu.Item color="red" onClick={() => onReviewReject(row.attendance!.id)}>
                    Rechazar asistencia
                  </Menu.Item>
                </>
              ) : null}
              {assignmentAction === "end" ? (
                <Menu.Item
                  disabled={endPending}
                  onClick={() => onEndAssignment(assignment!)}
                >
                  {assignmentActionLabel(assignmentAction)}
                </Menu.Item>
              ) : null}
              {assignmentAction === "cancel-current" || assignmentAction === "cancel-future" ? (
                <Menu.Item
                  color="red"
                  disabled={cancelPending}
                  onClick={() => onCancelAssignment(assignment!)}
                >
                  {assignmentActionLabel(assignmentAction)}
                </Menu.Item>
              ) : null}
            </Menu.Dropdown>
          </Menu>
        );
      }}
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
      aria-label="Equipo asignado y asistencia"
    />
  );
}
