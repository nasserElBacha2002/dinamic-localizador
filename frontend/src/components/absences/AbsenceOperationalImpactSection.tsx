import { Accordion, Alert, Button, Select, Stack, Text, Textarea } from "@mantine/core";
import { useState } from "react";
import { Link as RouterLink } from "react-router";
import {
  DataTable,
  SectionCard,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import {
  useAbsenceOperationalImpact,
  useResolveAbsenceOperationalConflict,
} from "../../hooks/useAbsences";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import type { AbsenceRequestStatus } from "../../types/absence";
import type { AbsenceOperationalResolutionCode } from "../../types/absence-operational-impact";
import { EntityLink } from "../entity-link";
import {
  buildAbsencePlanningRows,
  buildOperationCoverageHref,
  conflictTypeHumanLabel,
  type AbsencePlanningRow,
} from "../../pages/absences/absence-detail-planning";
import { formatAbsenceDate } from "../../utils/absence-labels";
import { getApiErrorMessage } from "../../utils/errors";
import { hasPermission } from "../../utils/permissions";

const newCommandId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const advancedResolutionOptions: Array<{
  value: AbsenceOperationalResolutionCode;
  label: string;
}> = [
  { value: "KEEP_REDUCED_STAFFING", label: "Mantener con dotación reducida" },
  { value: "CANCEL_ASSIGNMENT", label: "Cancelar asignación afectada" },
  { value: "DISMISS_WITH_REASON", label: "Registrar excepción con motivo" },
];

type Props = {
  requestId: string;
  requestStatus: AbsenceRequestStatus;
};

export function AbsenceOperationalImpactSection({ requestId, requestStatus }: Props) {
  const permissionsQuery = useCompanyPermissions();
  const impactQuery = useAbsenceOperationalImpact(requestId);
  const resolveMutation = useResolveAbsenceOperationalConflict(requestId);
  const canManageOperations = hasPermission(
    permissionsQuery.data?.permissions,
    "operations:manage",
  );
  const canViewOperations =
    canManageOperations ||
    hasPermission(permissionsQuery.data?.permissions, "operations:read");

  const [selectedConflictId, setSelectedConflictId] = useState<string | null>(null);
  const [resolutionCode, setResolutionCode] =
    useState<AbsenceOperationalResolutionCode>("KEEP_REDUCED_STAFFING");
  const [resolutionReason, setResolutionReason] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [commandId, setCommandId] = useState(newCommandId);

  if (impactQuery.isLoading) {
    return (
      <SectionCard title="Planificación afectada">
        <Text c="dimmed">Evaluando planificación…</Text>
      </SectionCard>
    );
  }

  if (impactQuery.isError || !impactQuery.data) {
    return (
      <SectionCard title="Planificación afectada">
        <Alert color="red">
          {getApiErrorMessage(impactQuery.error, "No se pudo cargar la planificación afectada.")}
        </Alert>
      </SectionCard>
    );
  }

  const impact = impactQuery.data;
  const planningRows = buildAbsencePlanningRows(impact, requestStatus);
  const effectiveConflictId =
    selectedConflictId ?? impact.openConflicts[0]?.id ?? null;
  const showEmptyPlanning =
    planningRows.length === 0 &&
    impact.affectedOperations === 0 &&
    impact.affectedWorkdays === 0;

  const renderPlanningAction = (row: AbsencePlanningRow) => {
    if (row.needsCoverage && canManageOperations && row.operationId) {
      return (
        <Button
          component={RouterLink}
          to={buildOperationCoverageHref(row.operationId)}
          size="compact-xs"
          variant="light"
        >
          Cubrir jornada
        </Button>
      );
    }
    if (canViewOperations && row.operationId) {
      return (
        <Button
          component={RouterLink}
          to={buildOperationCoverageHref(row.operationId)}
          size="compact-xs"
          variant="subtle"
        >
          Ver operación
        </Button>
      );
    }
    return (
      <Text size="sm" c="dimmed">
        —
      </Text>
    );
  };

  const planningColumns: DataTableColumn<AbsencePlanningRow>[] = [
    {
      key: "service",
      header: "Servicio",
      render: (row) => (
        <EntityLink entityType="service" entityId={row.serviceId} label={row.serviceName} />
      ),
    },
    {
      key: "date",
      header: "Fecha",
      getValue: (row) => formatAbsenceDate(row.workDate),
    },
    {
      key: "shift",
      header: "Turno",
      getValue: (row) => row.shiftLabel ?? "—",
    },
    {
      key: "status",
      header: "Estado",
      getValue: (row) => row.operationStatusLabel,
    },
    {
      key: "situation",
      header: "Situación",
      getValue: (row) => row.situationLabel,
    },
    {
      key: "action",
      header: "Acción",
      render: (row) => renderPlanningAction(row),
    },
  ];

  const planningMobileCard: DataTableMobileCardConfig<AbsencePlanningRow> = {
    title: (row) => (
      <EntityLink entityType="service" entityId={row.serviceId} label={row.serviceName} />
    ),
    fields: [
      {
        key: "date",
        label: "Fecha",
        getValue: (row) => formatAbsenceDate(row.workDate),
        visibility: "always",
      },
      {
        key: "shift",
        label: "Turno",
        getValue: (row) => row.shiftLabel ?? "—",
        visibility: "always",
      },
      {
        key: "situation",
        label: "Situación",
        getValue: (row) => row.situationLabel,
        visibility: "always",
      },
      {
        key: "action",
        label: "Acción",
        render: (row) => renderPlanningAction(row),
        visibility: "always",
      },
    ],
  };

  return (
    <SectionCard
      title="Planificación afectada"
      description="Operaciones y jornadas que pueden requerir acción."
    >
      <Stack gap="md">
        {!impact.featureEnabled ? (
          <Alert color="gray">
            La integración operativa está deshabilitada para esta empresa (vista informativa).
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

        {impact.workdays.some((workday) => workday.hasAttendancePresence) ? (
          <Alert color="red">
            Hay jornadas con asistencia registrada en el período. Revisá la operación antes de
            confirmar cambios.
          </Alert>
        ) : null}

        {showEmptyPlanning ? (
          <Text c="dimmed" size="sm">
            No se detectaron jornadas asignadas superpuestas con esta ausencia.
          </Text>
        ) : (
          <DataTable
            rows={planningRows}
            columns={planningColumns}
            getRowKey={(row) => row.key}
            mobileView="cards"
            mobileCard={planningMobileCard}
            aria-label="Planificación afectada por la ausencia"
          />
        )}

        {impact.openConflicts.length > 0 && canManageOperations ? (
          <Accordion variant="contained">
            <Accordion.Item value="advanced-conflicts">
              <Accordion.Control>Resolución avanzada de conflictos</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <Text size="sm" c="dimmed">
                    Para asignar un reemplazo, usá{" "}
                    <Text span fw={600}>
                      Cubrir jornada
                    </Text>{" "}
                    en la operación correspondiente.
                  </Text>
                  <Select
                    label="Conflicto"
                    data={impact.openConflicts.map((conflict) => ({
                      value: conflict.id,
                      label: conflictTypeHumanLabel(conflict.conflictType),
                    }))}
                    value={effectiveConflictId}
                    onChange={(value) => {
                      setSelectedConflictId(value);
                      setCommandId(newCommandId());
                    }}
                  />
                  <Select
                    label="Resolución"
                    data={advancedResolutionOptions}
                    value={resolutionCode}
                    onChange={(value) => {
                      setResolutionCode(
                        (value as AbsenceOperationalResolutionCode | null) ??
                          "KEEP_REDUCED_STAFFING",
                      );
                      setCommandId(newCommandId());
                    }}
                  />
                  <Textarea
                    label="Motivo de la resolución"
                    value={resolutionReason}
                    onChange={(event) => setResolutionReason(event.currentTarget.value)}
                    minRows={2}
                  />
                  {resolveError ? <Alert color="red">{resolveError}</Alert> : null}
                  <Button
                    loading={resolveMutation.isPending}
                    disabled={
                      !effectiveConflictId ||
                      resolutionReason.trim().length < 3 ||
                      impact.openConflicts.length === 0
                    }
                    onClick={() => {
                      if (!effectiveConflictId) {
                        return;
                      }
                      setResolveError(null);
                      void resolveMutation
                        .mutateAsync({
                          conflictId: effectiveConflictId,
                          resolutionCode,
                          resolutionReason: resolutionReason.trim(),
                          commandId,
                        })
                        .then(() => {
                          setSelectedConflictId(null);
                          setResolutionReason("");
                          setCommandId(newCommandId());
                          void impactQuery.refetch();
                        })
                        .catch((error: unknown) =>
                          setResolveError(getApiErrorMessage(error, "No se pudo resolver.")),
                        );
                    }}
                  >
                    Registrar resolución
                  </Button>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>
        ) : null}
      </Stack>
    </SectionCard>
  );
}
