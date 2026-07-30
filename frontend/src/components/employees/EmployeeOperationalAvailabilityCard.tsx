import { Anchor, Group, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { getEmployeeOperationalAvailability } from "../../api/employees.api";
import { StatusBadge } from "../../design-system";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import { getApiErrorMessage } from "../../utils/errors";

const statusLabels: Record<string, string> = {
  AVAILABLE: "Disponible",
  UNAVAILABLE: "No disponible",
  PARTIALLY_UNAVAILABLE: "Parcialmente no disponible",
  PROVISIONALLY_UNAVAILABLE: "Provisionalmente no disponible",
};

export function EmployeeOperationalAvailabilityCard({ employeeId }: { employeeId: string }) {
  const { companyId, enabled } = useOperationalQueryEnabled();
  const query = useQuery({
    queryKey: ["employees", companyId, employeeId, "operational-availability"],
    queryFn: ({ signal }) => getEmployeeOperationalAvailability(employeeId, { signal }),
    enabled: enabled && Boolean(employeeId),
  });

  if (query.isLoading) {
    return <Text size="sm">Cargando disponibilidad operativa…</Text>;
  }

  if (query.isError || !query.data) {
    return (
      <Text size="sm" c="dimmed">
        {getApiErrorMessage(query.error, "No se pudo cargar la disponibilidad operativa.")}
      </Text>
    );
  }

  const data = query.data;

  return (
    <Stack gap="sm">
      <Group gap="xs">
        <Text size="sm" fw={500}>
          Estado actual
        </Text>
        <StatusBadge
          label={statusLabels[data.currentStatus] ?? data.currentStatus}
          tone={data.currentStatus === "AVAILABLE" ? "success" : "warning"}
        />
      </Group>

      {data.nextApprovedAbsence ? (
        <Text size="sm">
          Próxima ausencia aprobada:{" "}
          <Anchor component={Link} to={`/absences/${data.nextApprovedAbsence.id}`}>
            {data.nextApprovedAbsence.startDate} → {data.nextApprovedAbsence.endDate}
          </Anchor>
        </Text>
      ) : (
        <Text size="sm" c="dimmed">
          Sin ausencias aprobadas próximas.
        </Text>
      )}

      <Text size="sm">
        Solicitudes pendientes: {data.pendingRequests.length}
        {data.pendingRequests.length > 0 ? (
          <>
            {" "}
            (
            {data.pendingRequests.slice(0, 3).map((r, index) => (
              <span key={r.id}>
                {index > 0 ? ", " : null}
                <Anchor component={Link} to={`/absences/${r.id}`}>
                  {r.status}
                </Anchor>
              </span>
            ))}
            )
          </>
        ) : null}
      </Text>

      <Text size="sm">
        Operaciones afectadas: {data.affectedOperationIds.length}
        {data.affectedOperationIds.slice(0, 3).map((operationId) => (
          <span key={operationId}>
            {" · "}
            <Anchor component={Link} to={`/operations/${operationId}`}>
              ver
            </Anchor>
          </span>
        ))}
      </Text>

      <Text size="sm">
        Conflictos abiertos: {data.openConflicts.length}
        {data.openConflicts.slice(0, 3).map((conflict) => (
          <span key={conflict.id}>
            {" · "}
            <Anchor component={Link} to={`/absences/${conflict.absenceRequestId}`}>
              {conflict.conflictType}
            </Anchor>
          </span>
        ))}
      </Text>

      <Text size="sm">Reemplazos relacionados: {data.relatedReplacements.length}</Text>
    </Stack>
  );
}
