import { Alert, Button, Group, SimpleGrid, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
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
// Embedded detail sub-table: pagination is scoped to this section, not a navigable list view.
import type { InventoryAttendanceSummaryEmployee } from "../../types/inventory-attendance-summary";
import { formatDateTime } from "../../utils/dates";
import { formatDistanceMeters, getRelatedName, safeText } from "../../utils/display-safe";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import {
  locationStatusLabels,
  checkoutStatusLabels,
  operationalStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";
import {
  checkoutStatusTone,
  locationStatusTone,
  operationalStatusTone,
  punctualityStatusTone,
  validationStatusTone,
} from "../../utils/attendance-status-tones";

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

  const columns = useMemo<DataTableColumn<InventoryAttendanceSummaryEmployee>[]>(
    () => [
      {
        key: "employee",
        header: terminology.worker.singular,
        getValue: (row) => getRelatedName(row.employee),
      },
      {
        key: "phone",
        header: "Teléfono",
        getValue: (row) => safeText(row.employee?.phoneNumber ?? null),
      },
      {
        key: "expected",
        header: "Hora esperada",
        getValue: () => formatDateTime(scheduledStart),
      },
      {
        key: "checkIn",
        header: "Check-in",
        getValue: (row) =>
          row.attendance ? formatDateTime(row.attendance.receivedAt) : "—",
      },
      {
        key: "distance",
        header: "Distancia",
        getValue: (row) =>
          row.attendance ? formatDistanceMeters(row.attendance.distanceMeters) : "—",
      },
      {
        key: "checkOut",
        header: "Check-out",
        getValue: (row) =>
          row.attendance?.checkoutAt ? formatDateTime(row.attendance.checkoutAt) : "—",
      },
      {
        key: "checkoutStatus",
        header: "Estado salida",
        render: (row) =>
          row.attendance?.checkoutStatus ? (
            <StatusBadge
              label={checkoutStatusLabels[row.attendance.checkoutStatus]}
              tone={checkoutStatusTone(row.attendance.checkoutStatus)}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "extraTime",
        header: "Tiempo extra",
        getValue: (row) =>
          row.attendance?.extraWorkedMinutes
            ? `${row.attendance.extraWorkedMinutes} min`
            : row.attendance?.earlyDepartureMinutes
              ? `${row.attendance.earlyDepartureMinutes} min antes`
              : "—",
      },
      {
        key: "location",
        header: "Ubicación",
        render: (row) =>
          row.attendance ? (
            <StatusBadge
              label={locationStatusLabels[row.attendance.locationStatus]}
              tone={locationStatusTone(row.attendance.locationStatus)}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "punctuality",
        header: "Puntualidad",
        render: (row) =>
          row.attendance ? (
            <StatusBadge
              label={punctualityStatusLabels[row.attendance.punctualityStatus]}
              tone={punctualityStatusTone(row.attendance.punctualityStatus)}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "validation",
        header: "Validación",
        render: (row) =>
          row.attendance ? (
            <StatusBadge
              label={validationStatusLabels[row.attendance.validationStatus]}
              tone={validationStatusTone(row.attendance.validationStatus)}
            />
          ) : (
            "—"
          ),
      },
      {
        key: "operational",
        header: "Estado operativo",
        render: (row) => (
          <StatusBadge
            label={operationalStatusLabels[row.operationalStatus]}
            tone={operationalStatusTone(row.operationalStatus)}
          />
        ),
      },
    ],
    [scheduledStart],
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
      {summary ? (
        <SimpleGrid cols={{ base: 2, sm: 3, md: 6 }} spacing="sm" mb="md">
          <Text size="sm">
            Asignados: <strong>{summary.assigned}</strong>
          </Text>
          <Text size="sm">
            Con check-in: <strong>{summary.checkedIn}</strong>
          </Text>
          <Text size="sm">
            Validados: <strong>{summary.valid}</strong>
          </Text>
          <Text size="sm">
            Pendientes: <strong>{summary.pendingReview}</strong>
          </Text>
          <Text size="sm">
            Rechazados: <strong>{summary.rejected}</strong>
          </Text>
          <Text size="sm">
            Sin registro: <strong>{summary.withoutCheckIn}</strong>
          </Text>
        </SimpleGrid>
      ) : null}

      {canAssign ? (
        <Group align="flex-end" gap="md" mb="md" wrap="wrap">
          <div style={{ flex: 1, minWidth: 260 }}>
            <EmployeeSearchAutocomplete
              label={`${terminology.worker.singular} activo`}
              value={selectedEmployeeId || null}
              onChange={(id) => setSelectedEmployeeId(id ?? "")}
              excludeIds={assignedEmployeeIds}
              descriptionMode="assignment"
              helperText="Buscá por nombre. Verás tipo y último día trabajado."
            />
          </div>
          <Button
            onClick={() => void handleAssign()}
            disabled={!selectedEmployeeId || assignMutation.isPending}
            loading={assignMutation.isPending}
            mb={4}
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
        rowActions={(row) => (
          <Group gap="xs" justify="flex-end" wrap="wrap">
            {row.attendance ? (
              <Button
                component={RouterLink}
                to={`/attendance/${row.attendance.id}`}
                size="compact-sm"
                variant="light"
              >
                Ver
              </Button>
            ) : null}
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
