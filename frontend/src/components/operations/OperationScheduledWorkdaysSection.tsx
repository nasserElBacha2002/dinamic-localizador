import { Button, Group, Stack, Table, Text, Tooltip } from "@mantine/core";
import { useState } from "react";
import { ErrorState } from "../../design-system/components/ErrorState";
import { LoadingState } from "../../design-system/components/LoadingState";
import { PaginationControls } from "../../design-system/components/PaginationControls";
import { mapApiPaginationMeta } from "../../design-system/components/pagination-meta";
import { SectionCard } from "../../design-system/components/SectionCard";
import { StatusBadge } from "../../design-system/components/StatusBadge";
import { usePaginationState } from "../../hooks/usePaginationState";
import {
  useMaterializeOperationWorkdays,
  useOperationWorkdayDetail,
  useOperationWorkdays,
} from "../../hooks/useOperations";
import type { OperationWorkdaySummary } from "../../types/operation-workday";
import { getApiErrorMessage } from "../../utils/errors";

import {
  buildMaterializationSuccessMessage,
  formatExpectedTimeRange,
  formatWorkdayDate,
  workdayStatusLabels,
} from "./operation-workday-display";

interface WorkdayRowProps {
  operationId: string;
  workday: OperationWorkdaySummary;
}

function WorkdayRow({ operationId, workday }: WorkdayRowProps) {
  const [expanded, setExpanded] = useState(false);
  const detailQuery = useOperationWorkdayDetail(operationId, workday.id, expanded);

  return (
    <>
      <Table.Tr>
        <Table.Td>{formatWorkdayDate(workday.workDate)}</Table.Td>
        <Table.Td>{formatExpectedTimeRange(workday)}</Table.Td>
        <Table.Td>
          <StatusBadge
            label={workdayStatusLabels[workday.status]}
            tone={workday.status === "ACTIVE" ? "info" : "neutral"}
            variant="light"
          />
        </Table.Td>
        <Table.Td>{workday.expectedEmployeesCount}</Table.Td>
        <Table.Td>
          <Button variant="subtle" size="compact-xs" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Ocultar" : "Ver"}
          </Button>
        </Table.Td>
      </Table.Tr>
      {expanded ? (
        <Table.Tr>
          <Table.Td colSpan={5}>
            <Stack gap="xs" p="sm">
              {detailQuery.isLoading ? <LoadingState message="Cargando colaboradores..." /> : null}
              {detailQuery.isError ? (
                <ErrorState
                  message={getApiErrorMessage(
                    detailQuery.error,
                    "No se pudieron cargar los colaboradores esperados.",
                  )}
                />
              ) : null}
              {detailQuery.data?.expectedEmployees.length ? (
                <Table withTableBorder>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Colaborador</Table.Th>
                      <Table.Th>Estado de expectativa</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {detailQuery.data.expectedEmployees.map((employee) => (
                      <Table.Tr key={employee.employeeId}>
                        <Table.Td>{employee.employeeName}</Table.Td>
                        <Table.Td>
                          {employee.expectationStatus === "EXPECTED" ? "Esperado" : "Cancelado"}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              ) : null}
              {detailQuery.data && detailQuery.data.expectedEmployees.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Sin colaboradores esperados en esta jornada.
                </Text>
              ) : null}
            </Stack>
          </Table.Td>
        </Table.Tr>
      ) : null}
    </>
  );
}

interface OperationScheduledWorkdaysSectionProps {
  operationId: string;
  canManage: boolean;
  onFeedback: (message: string, severity: "success" | "error") => void;
}

export function OperationScheduledWorkdaysSection({
  operationId,
  canManage,
  onFeedback,
}: OperationScheduledWorkdaysSectionProps) {
  const pagination = usePaginationState(14);
  const workdaysQuery = useOperationWorkdays(operationId, {
    page: pagination.page,
    limit: pagination.pageSize,
  });
  const materializeMutation = useMaterializeOperationWorkdays(operationId);

  const handleMaterialize = async () => {
    try {
      const result = await materializeMutation.mutateAsync();
      onFeedback(buildMaterializationSuccessMessage(result), "success");
    } catch (error) {
      onFeedback(getApiErrorMessage(error), "error");
    }
  };

  const rows = workdaysQuery.data?.data ?? [];
  const meta = workdaysQuery.data?.meta;

  return (
    <SectionCard
      title="Jornadas programadas"
      description="Próximas jornadas concretas según el horario y las asignaciones vigentes."
      action={
        canManage ? (
          <Group gap="xs">
            <Tooltip label="Genera y actualiza las próximas jornadas según el horario y las asignaciones vigentes.">
              <Button
                variant="default"
                size="compact-sm"
                loading={materializeMutation.isPending}
                onClick={() => void handleMaterialize()}
              >
                Actualizar jornadas
              </Button>
            </Tooltip>
          </Group>
        ) : undefined
      }
    >
      <Text size="xs" c="dimmed" mb="sm">
        Las jornadas se actualizan automáticamente. También podés sincronizarlas ahora.
      </Text>

      {workdaysQuery.isLoading ? <LoadingState message="Cargando jornadas..." /> : null}
      {workdaysQuery.isError ? (
        <ErrorState
          message={getApiErrorMessage(workdaysQuery.error, "No se pudieron cargar las jornadas.")}
        />
      ) : null}

      {!workdaysQuery.isLoading && !workdaysQuery.isError ? (
        rows.length === 0 ? (
          <Text size="sm" c="dimmed">
            Todavía no hay jornadas materializadas para esta operación.
          </Text>
        ) : (
          <Stack gap="md">
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Horario esperado</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Colaboradores esperados</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((workday) => (
                  <WorkdayRow key={workday.id} operationId={operationId} workday={workday} />
                ))}
              </Table.Tbody>
            </Table>
            {meta ? (
              <PaginationControls
                meta={mapApiPaginationMeta(meta)}
                pageSize={pagination.pageSize}
                onPageChange={pagination.onPageChange}
                onPageSizeChange={pagination.onPageSizeChange}
                showPageSizeSelector
              />
            ) : null}
          </Stack>
        )
      ) : null}
    </SectionCard>
  );
}
