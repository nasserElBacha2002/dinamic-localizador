import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ReviewAttendanceDialog } from "../attendance/ReviewAttendanceDialog";
import { EmployeeSearchAutocomplete } from "../employees/EmployeeSearchAutocomplete";
import {
  DataTable,
  mapApiPaginationMeta,
  PaginationControls,
  SectionCard,
  StatusBadge,
  type DataTableColumn,
} from "../../design-system";
import { useReviewAttendance } from "../../hooks/useAttendance";
import {
  useAssignInventoryEmployee,
  useInventoryAttendanceSummary,
  useUnassignInventoryEmployee,
} from "../../hooks/useInventories";
import { usePaginationState } from "../../hooks/usePaginationState";
import type { InventoryAttendanceSummaryEmployee } from "../../types/inventory-attendance-summary";
import { formatTime } from "../../utils/dates";
import { getRelatedName, safeText } from "../../utils/display-safe";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
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
} from "../../utils/inventory-operational-display";
import { navigateWithListContext } from "../../utils/list-navigation";
import { OperationalSummaryMetrics } from "./OperationalSummaryMetrics";

interface InventoryOperationalSectionProps {
  inventoryId: string;
  canAssign: boolean;
  scheduledStart: string;
  assignedEmployeeIds: string[];
  onFeedback: (message: string, severity: "success" | "error") => void;
}

const canReviewAttendance = (row: InventoryAttendanceSummaryEmployee): boolean => {
  if (!row.attendance || row.attendance.reviewedAt) {
    return false;
  }

  return (
    row.attendance.validationStatus === "PENDING_REVIEW" ||
    row.attendance.validationStatus === "REJECTED"
  );
};

export function InventoryOperationalSection({
  inventoryId,
  canAssign,
  scheduledStart,
  assignedEmployeeIds,
  onFeedback,
}: InventoryOperationalSectionProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const inventoryDetailPath = `/inventories/${inventoryId}`;
  const pagination = usePaginationState(10);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [reviewTarget, setReviewTarget] = useState<{
    attendanceId: string;
    decision: "APPROVE" | "REJECT";
  } | null>(null);

  const summaryQuery = useInventoryAttendanceSummary(inventoryId, {
    page: pagination.page,
    limit: pagination.pageSize,
  });
  const assignMutation = useAssignInventoryEmployee(inventoryId);
  const unassignMutation = useUnassignInventoryEmployee(inventoryId);
  const reviewMutation = useReviewAttendance();

  const handleAssign = async () => {
    if (!selectedEmployeeId) {
      return;
    }

    try {
      await assignMutation.mutateAsync(selectedEmployeeId);
      setSelectedEmployeeId("");
      pagination.resetPage();
      onFeedback(`${terminology.worker.singular} asignado correctamente.`, "success");
    } catch (error) {
      onFeedback(getApiErrorMessage(error), "error");
    }
  };

  const handleUnassign = async (employeeId: string) => {
    try {
      await unassignMutation.mutateAsync(employeeId);
      onFeedback(`${terminology.worker.singular} desasignado correctamente.`, "success");
    } catch (error) {
      onFeedback(getApiErrorMessage(error), "error");
    }
  };

  const handleReview = async (input: { decision: "APPROVE" | "REJECT"; reason: string }) => {
    if (!reviewTarget) {
      return;
    }

    try {
      await reviewMutation.mutateAsync({
        attendanceId: reviewTarget.attendanceId,
        input,
      });
      setReviewTarget(null);
      onFeedback("Revisión registrada correctamente.", "success");
    } catch (error) {
      onFeedback(getApiErrorMessage(error), "error");
    }
  };

  const summary = summaryQuery.data?.summary;
  const rows = summaryQuery.data?.employees ?? [];
  const meta = summaryQuery.data?.meta;
  const expectedArrivalTime = formatTime(scheduledStart);

  const columns = useMemo<DataTableColumn<InventoryAttendanceSummaryEmployee>[]>(
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
    <SectionCard
      title="Vista operativa"
      description={`Seguimiento de ${terminology.worker.plural.toLowerCase()} asignados y asistencias registradas.`}
      action={
        <Button
          variant="default"
          size="compact-sm"
          onClick={() => void summaryQuery.refetch()}
          loading={summaryQuery.isFetching}
        >
          Actualizar
        </Button>
      }
    >
      {summary ? <OperationalSummaryMetrics summary={summary} /> : null}

      {canAssign ? (
        <Group align="flex-end" gap="sm" mb="md" wrap="nowrap">
          <div style={{ flex: 1, minWidth: 0 }}>
            <EmployeeSearchAutocomplete
              label={`${terminology.worker.singular} activo`}
              value={selectedEmployeeId || null}
              onChange={(id) => setSelectedEmployeeId(id ?? "")}
              excludeIds={assignedEmployeeIds}
              descriptionMode="assignment"
              helperText="Buscá por nombre. Verás tipo y último día trabajado."
              placeholder="Nombre o teléfono"
            />
          </div>
          <Button
            onClick={() => void handleAssign()}
            disabled={!selectedEmployeeId || assignMutation.isPending}
            loading={assignMutation.isPending}
          >
            Asignar
          </Button>
        </Group>
      ) : (
        <Alert color="blue" mb="md">
          No se pueden asignar {terminology.worker.plural.toLowerCase()} a{" "}
          {terminology.operation.plural.toLowerCase()} completadas o canceladas.
        </Alert>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(row) => row.employee.id}
        loading={summaryQuery.isLoading}
        error={
          summaryQuery.isError
            ? getApiErrorMessage(summaryQuery.error, "No se pudo cargar la vista operativa.")
            : undefined
        }
        emptyTitle={`No hay ${terminology.worker.plural.toLowerCase()} asignados`}
        emptyDescription={`Asigná ${terminology.worker.plural.toLowerCase()} activos para comenzar el seguimiento operativo.`}
        onRowClick={(row) => {
          if (!row.attendance) {
            return;
          }

          navigateWithListContext(
            navigate,
            `/attendance/${row.attendance.id}`,
            inventoryDetailPath,
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
                  onClick={() =>
                    setReviewTarget({
                      attendanceId: row.attendance!.id,
                      decision: "APPROVE",
                    })
                  }
                >
                  Aprobar
                </Button>
                <Button
                  size="compact-sm"
                  color="danger"
                  variant="default"
                  onClick={() =>
                    setReviewTarget({
                      attendanceId: row.attendance!.id,
                      decision: "REJECT",
                    })
                  }
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
                disabled={unassignMutation.isPending}
                loading={unassignMutation.isPending}
                onClick={() => void handleUnassign(row.employee.id)}
              >
                Desasignar
              </Button>
            ) : null}
          </Group>
        )}
        pagination={
          meta ? (
            <PaginationControls
              meta={mapApiPaginationMeta(meta)}
              pageSize={pagination.pageSize}
              onPageChange={pagination.onPageChange}
              onPageSizeChange={pagination.onPageSizeChange}
              showPageSizeSelector
            />
          ) : null
        }
        aria-label="Vista operativa de colaboradores"
      />

      <ReviewAttendanceDialog
        open={Boolean(reviewTarget)}
        decision={reviewTarget?.decision ?? "APPROVE"}
        loading={reviewMutation.isPending}
        onClose={() => setReviewTarget(null)}
        onConfirm={handleReview}
      />
    </SectionCard>
  );
}
