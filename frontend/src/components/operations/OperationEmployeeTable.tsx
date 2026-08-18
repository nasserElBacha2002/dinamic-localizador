import { Button, Group, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { useLocation, useNavigate } from "react-router";
import { EntityLink } from "../entity-link";
import {
  ActionMenu,
  DataTable,
  PaginationControls,
  StatusBadge,
  mapApiPaginationMeta,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
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
): { typeAndPhone: string; workTeamId: string | null; workTeamName: string | null } {
  const parts: string[] = [];
  if (row.employee?.employeeType) {
    parts.push(employeeTypeLabels[row.employee.employeeType]);
  }
  const phone = safeText(row.employee?.phoneNumber ?? null);
  if (phone !== "—") {
    parts.push(phone);
  }
  const workTeamId =
    assignment?.assignmentOrigin === "WORK_TEAM" ? (assignment.sourceWorkTeamId ?? null) : null;
  const workTeamName =
    assignment?.assignmentOrigin === "WORK_TEAM" ? (assignment.sourceWorkTeamName ?? null) : null;
  return { typeAndPhone: parts.join(" · "), workTeamId, workTeamName };
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
                <EntityLink
                  entityType="employee"
                  entityId={row.employee?.id}
                  label={getRelatedName(row.employee)}
                />
              </Text>
              {secondary.workTeamName ? (
                <Text size="xs" c="dimmed">
                  Grupo:{" "}
                  <EntityLink
                    entityType="workTeam"
                    entityId={secondary.workTeamId}
                    label={secondary.workTeamName}
                  />
                </Text>
              ) : null}
              {secondary.typeAndPhone ? (
                <Text size="xs" c="dimmed">
                  {secondary.typeAndPhone}
                </Text>
              ) : null}
              {row.absenceBadges && row.absenceBadges.length > 0 ? (
                <Group gap={4} wrap="wrap">
                  {row.absenceBadges.map((badge) => (
                    <StatusBadge
                      key={`${row.assignmentId}-${badge.code}`}
                      label={badge.label}
                      tone={
                        badge.code === "OPEN_CONFLICT" || badge.code === "ABSENT"
                          ? "danger"
                          : badge.code === "REPLACEMENT_PENDING" ||
                              badge.code === "PARTIAL_ABSENCE"
                            ? "warning"
                            : "neutral"
                      }
                    />
                  ))}
                </Group>
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

  const mobileCard = useMemo<DataTableMobileCardConfig<OperationAttendanceSummaryEmployee>>(
    () => ({
      title: (row) => (
        <EntityLink
          entityType="employee"
          entityId={row.employee?.id}
          label={getRelatedName(row.employee)}
        />
      ),
      status: (row) => (
        <StatusBadge
          label={operationalAttendanceStatusTableLabels[row.operationalStatus]}
          tone={operationalStatusTone(row.operationalStatus)}
        />
      ),
      fields: [
        {
          key: "confirmation",
          label: "Confirmación",
          render: (row) => assignmentConfirmationStatusTableLabels[row.confirmationStatus],
          visibility: "always",
        },
        {
          key: "checkIn",
          label: "Check-in",
          render: (row) => formatOperationalCheckInCell(row.attendance),
          visibility: "always",
        },
        {
          key: "checkOut",
          label: "Check-out",
          render: (row) => formatOperationalCheckOutCell(row.attendance),
          visibility: "always",
        },
        {
          key: "team",
          label: "Equipo / tipo",
          render: (row) => {
            const secondary = buildEmployeeSecondaryLine(row, assignmentById?.get(row.assignmentId));
            if (!secondary.workTeamName && !secondary.typeAndPhone) {
              return "—";
            }
            return (
              <Stack gap={2}>
                {secondary.workTeamName ? (
                  <EntityLink
                    entityType="workTeam"
                    entityId={secondary.workTeamId}
                    label={secondary.workTeamName}
                  />
                ) : null}
                {secondary.typeAndPhone ? <span>{secondary.typeAndPhone}</span> : null}
              </Stack>
            );
          },
          visibility: "expanded",
        },
      ],
    }),
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
      mobileView="summary"
      mobileCard={mobileCard}
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

        if (!canReview && !assignmentAction && !hasAttendanceDetail && !(row.absenceBadges?.length)) {
          // Still allow opening collaborator / absence deep-links when badges exist.
        }

        const items = [];
        if (hasAttendanceDetail) {
          items.push({
            key: "detail",
            label: "Ver detalle",
            onClick: () =>
              navigateWithListContext(
                navigate,
                `/attendance/${row.attendance!.id}`,
                operationDetailPath,
                location,
              ),
          });
        }
        const absenceLink = row.absenceBadges?.find((b) => b.absenceRequestId)?.absenceRequestId
          ?? row.absenceRequestId;
        if (absenceLink) {
          items.push({
            key: "absence",
            label: "Ver ausencia",
            onClick: () =>
              navigateWithListContext(
                navigate,
                `/absences/${absenceLink}`,
                operationDetailPath,
                location,
              ),
          });
        }
        const conflictLink = row.absenceBadges?.find((b) => b.conflictId);
        if (conflictLink?.absenceRequestId && conflictLink.conflictId) {
          items.push({
            key: "conflict",
            label: "Ver conflicto",
            onClick: () =>
              navigateWithListContext(
                navigate,
                `/absences/${conflictLink.absenceRequestId}`,
                operationDetailPath,
                location,
              ),
          });
        }
        items.push({
          key: "employee",
          label: "Ver colaborador",
          onClick: () =>
            navigateWithListContext(
              navigate,
              `/employees/${row.employee.id}`,
              operationDetailPath,
              location,
            ),
        });
        if (canReview) {
          items.push(
            {
              key: "approve",
              label: "Aprobar asistencia",
              onClick: () => onReviewApprove(row.attendance!.id),
            },
            {
              key: "reject",
              label: "Rechazar asistencia",
              destructive: true,
              onClick: () => onReviewReject(row.attendance!.id),
            },
          );
        }
        if (assignmentAction === "end") {
          items.push({
            key: "end",
            label: assignmentActionLabel(assignmentAction),
            disabled: endPending,
            loading: endPending,
            onClick: () => onEndAssignment(assignment!),
          });
        }
        if (assignmentAction === "cancel-current" || assignmentAction === "cancel-future") {
          items.push({
            key: "cancel-assignment",
            label: assignmentActionLabel(assignmentAction),
            destructive: true,
            disabled: cancelPending,
            loading: cancelPending,
            onClick: () => onCancelAssignment(assignment!),
          });
        }

        return (
          <ActionMenu
            mode="menu"
            primary={
              hasAttendanceDetail ? (
                <Button
                  size="compact-xs"
                  variant="light"
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
                </Button>
              ) : undefined
            }
            items={items.filter((item) => item.key !== "detail")}
            menuLabel={`Más acciones de ${getRelatedName(row.employee)}`}
          />
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
