import { Alert, Button, Select, Stack, Text, Textarea } from "@mantine/core";
import { useState } from "react";
import { Link as RouterLink } from "react-router";
import {
  DataTable,
  SectionCard,
  StatusBadge,
  type DataTableColumn,
} from "../../design-system";
import {
  useAbsenceOperationalImpact,
  useResolveAbsenceOperationalConflict,
} from "../../hooks/useAbsences";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import type {
  AbsenceOperationalConflict,
  AbsenceOperationalResolutionCode,
} from "../../types/absence-operational-impact";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { hasPermission } from "../../utils/permissions";

const availabilityLabels: Record<string, string> = {
  AVAILABLE: "Disponible",
  PROVISIONALLY_UNAVAILABLE: "No disponible (provisional)",
  UNAVAILABLE: "No disponible",
  PARTIALLY_UNAVAILABLE: "Parcialmente no disponible",
};

const conflictTypeLabels: Record<string, string> = {
  ASSIGNMENT_DURING_ABSENCE: "Asignación durante ausencia",
  ATTENDANCE_RECORDED_DURING_APPROVED_ABSENCE: "Asistencia registrada durante ausencia",
  RESPONSIBLE_UNAVAILABLE: "Responsable no disponible",
  OPERATION_AFFECTED: "Operación afectada",
};

const resolutionOptions: Array<{ value: AbsenceOperationalResolutionCode; label: string }> = [
  { value: "KEEP_REDUCED_STAFFING", label: "Mantener con dotación reducida" },
  { value: "ASSIGN_REPLACEMENT", label: "Registrar reemplazo (manual)" },
  { value: "CANCEL_ASSIGNMENT", label: "Registrar intención de cancelar asignación" },
  { value: "DISMISS_WITH_REASON", label: "Ignorar conflicto con motivo" },
];

type Props = {
  requestId: string;
};

export function AbsenceOperationalImpactSection({ requestId }: Props) {
  const permissionsQuery = useCompanyPermissions();
  const impactQuery = useAbsenceOperationalImpact(requestId);
  const resolveMutation = useResolveAbsenceOperationalConflict(requestId);
  const canResolve = hasPermission(permissionsQuery.data?.permissions, "operations:manage");

  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);
  const [resolutionCode, setResolutionCode] =
    useState<AbsenceOperationalResolutionCode>("KEEP_REDUCED_STAFFING");
  const [resolutionReason, setResolutionReason] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);

  if (impactQuery.isLoading) {
    return (
      <SectionCard title="Impacto operativo">
        <Text c="dimmed">Calculando impacto…</Text>
      </SectionCard>
    );
  }

  if (impactQuery.isError || !impactQuery.data) {
    return (
      <SectionCard title="Impacto operativo">
        <Alert color="red">
          {getApiErrorMessage(impactQuery.error, "No se pudo cargar el impacto operativo.")}
        </Alert>
      </SectionCard>
    );
  }

  const impact = impactQuery.data;
  const conflictColumns: DataTableColumn<AbsenceOperationalConflict>[] = [
    {
      key: "type",
      header: "Tipo",
      getValue: (row) => conflictTypeLabels[row.conflictType] ?? row.conflictType,
    },
    {
      key: "severity",
      header: "Severidad",
      getValue: (row) => row.severity,
    },
    {
      key: "status",
      header: "Estado",
      render: (row) => <StatusBadge label={row.status} tone="neutral" variant="light" />,
    },
    {
      key: "operation",
      header: "Operación",
      render: (row) =>
        row.operationId ? (
          <Button
            component={RouterLink}
            to={`/operations/${row.operationId}`}
            size="compact-xs"
            variant="light"
          >
            Ver
          </Button>
        ) : (
          "—"
        ),
    },
  ];

  return (
    <SectionCard title="Impacto operativo">
      <Stack gap="md">
        {!impact.featureEnabled ? (
          <Alert color="gray">
            La integración operativa está deshabilitada para esta empresa (solo vista previa).
          </Alert>
        ) : null}

        <Text size="sm">
          {impact.affectedWorkdays} jornada(s) · {impact.affectedOperations} operación(es) ·{" "}
          {impact.attendanceConflicts} conflicto(s) de asistencia · disponibilidad:{" "}
          {availabilityLabels[impact.availabilityStatus] ?? impact.availabilityStatus}
        </Text>

        {impact.requiresManualAction ? (
          <Alert color="yellow">
            Esta ausencia requiere acción manual: revisá conflictos y planificación antes de
            confirmar.
          </Alert>
        ) : null}

        {impact.staffingWarnings.length > 0 ? (
          <Stack gap="xs">
            {impact.staffingWarnings.map((warning) => (
              <Alert key={`${warning.operationId}-${warning.code}`} color="orange">
                {warning.message}
              </Alert>
            ))}
          </Stack>
        ) : null}

        {impact.workdays.some((w) => w.hasAttendancePresence) ? (
          <Alert color="red">
            Hay jornadas con presencia registrada dentro del rango. No se sobrescribe la
            asistencia: quedan marcadas para revisión.
          </Alert>
        ) : null}

        {impact.openConflicts.length > 0 ? (
          <Stack gap="sm">
            <Text fw={600} size="sm">
              Conflictos abiertos
            </Text>
            <DataTable
              rows={impact.openConflicts}
              columns={conflictColumns}
              getRowKey={(row) => row.id}
              aria-label="Conflictos operativos de la ausencia"
            />
            {canResolve ? (
              <Stack gap="xs">
                <Select
                  label="Conflicto a resolver"
                  data={impact.openConflicts.map((c) => ({
                    value: c.id,
                    label: `${conflictTypeLabels[c.conflictType] ?? c.conflictType} · ${c.severity}`,
                  }))}
                  value={selectedConflictId}
                  onChange={(value) => setSelectedConflictId(value)}
                />
                <Select
                  label="Resolución"
                  data={resolutionOptions}
                  value={resolutionCode}
                  onChange={(value) =>
                    setResolutionCode(
                      (value as AbsenceOperationalResolutionCode | null) ??
                        "KEEP_REDUCED_STAFFING",
                    )
                  }
                />
                <Textarea
                  label="Motivo"
                  value={resolutionReason}
                  onChange={(event) => setResolutionReason(event.currentTarget.value)}
                  minRows={2}
                />
                {resolveError ? <Alert color="red">{resolveError}</Alert> : null}
                <Button
                  loading={resolveMutation.isPending}
                  disabled={!selectedConflictId || resolutionReason.trim().length < 3}
                  onClick={() => {
                    if (!selectedConflictId) {
                      return;
                    }
                    setResolveError(null);
                    void resolveMutation
                      .mutateAsync({
                        conflictId: selectedConflictId,
                        resolutionCode,
                        resolutionReason: resolutionReason.trim(),
                      })
                      .then(() => {
                        setSelectedConflictId(null);
                        setResolutionReason("");
                        void impactQuery.refetch();
                      })
                      .catch((error: unknown) =>
                        setResolveError(getApiErrorMessage(error, "No se pudo resolver.")),
                      );
                  }}
                >
                  Resolver conflicto
                </Button>
              </Stack>
            ) : null}
          </Stack>
        ) : (
          <Text c="dimmed" size="sm">
            Sin conflictos operativos abiertos.
            {impact.operations[0]
              ? ` Primera operación afectada: ${impact.operations[0].serviceName} (${formatDateTime(impact.operations[0].scheduledStart)}).`
              : ""}
          </Text>
        )}
      </Stack>
    </SectionCard>
  );
}
