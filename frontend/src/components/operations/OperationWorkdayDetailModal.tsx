import { Group, Stack, Text } from "@mantine/core";
import { ErrorState, LoadingState, ResponsiveModal, StatusBadge } from "../../design-system";
import { useOperationWorkdayDetail } from "../../hooks/useOperations";
import type { OperationWorkdaySummary } from "../../types/operation-workday";
import { getApiErrorMessage } from "../../utils/errors";
import {
  formatExpectedTimeRange,
  formatWorkdayDate,
  workdayStatusLabels,
} from "./operation-workday-display";
import { WorkdayEmployeeExpectationPanel } from "./WorkdayEmployeeExpectationPanel";

interface OperationWorkdayDetailModalProps {
  opened: boolean;
  onClose: () => void;
  operationId: string;
  workday: OperationWorkdaySummary | null;
}

export function OperationWorkdayDetailModal({
  opened,
  onClose,
  operationId,
  workday,
}: OperationWorkdayDetailModalProps) {
  const detailQuery = useOperationWorkdayDetail(operationId, workday?.id, opened && Boolean(workday));

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title="Detalle de jornada"
      size="lg"
      bodyMode="scroll"
    >
      {workday ? (
        <Stack gap="md">
          <Group gap="md" wrap="wrap">
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Fecha
              </Text>
              <Text size="sm" fw={500}>
                {formatWorkdayDate(workday.workDate)}
              </Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Horario esperado
              </Text>
              <Text size="sm" fw={500}>
                {formatExpectedTimeRange(workday)}
              </Text>
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Estado
              </Text>
              <StatusBadge
                label={workdayStatusLabels[workday.status]}
                tone={workday.status === "ACTIVE" ? "info" : "neutral"}
                variant="light"
              />
            </Stack>
            <Stack gap={2}>
              <Text size="xs" c="dimmed">
                Colaboradores programados
              </Text>
              <Text size="sm" fw={500}>
                {workday.scheduledEmployeesCount}
              </Text>
            </Stack>
          </Group>

          {detailQuery.isLoading ? <LoadingState message="Cargando colaboradores..." /> : null}
          {detailQuery.isError ? (
            <ErrorState
              message={getApiErrorMessage(
                detailQuery.error,
                "No se pudieron cargar los colaboradores esperados.",
              )}
            />
          ) : null}

          {detailQuery.data ? (
            <Stack gap="sm">
              <Text size="sm" fw={600}>
                Colaboradores de la jornada
              </Text>
              {detailQuery.data.expectedEmployees.length === 0 ? (
                <Text size="sm" c="dimmed">
                  Sin colaboradores esperados en esta jornada.
                </Text>
              ) : (
                detailQuery.data.expectedEmployees.map((employee) => (
                  <Group
                    key={employee.employeeId}
                    justify="space-between"
                    align="flex-start"
                    wrap="wrap"
                    py="xs"
                    style={{ borderBottom: "1px solid var(--mantine-color-gray-2)" }}
                  >
                    <Text size="sm" fw={500} style={{ minWidth: 0 }}>
                      {employee.employeeName}
                    </Text>
                    <WorkdayEmployeeExpectationPanel employee={employee} />
                  </Group>
                ))
              )}
            </Stack>
          ) : null}
        </Stack>
      ) : null}
    </ResponsiveModal>
  );
}
