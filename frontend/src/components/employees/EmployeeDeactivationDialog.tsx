import { Button, Group, Modal, Stack, Table, Text } from "@mantine/core";
import { FormErrorAlert } from "../../design-system";
import { terminology } from "../../domain/terminology";
import type { EmployeeDeactivationImpact } from "../../types/employee-deactivation";
import { operationStatusLabels } from "../../utils/labels";
import { operationKindLabels } from "../../utils/operation-schedule-display";
import { buildDeactivationSummaryMessage } from "./employee-deactivation-copy";

interface EmployeeDeactivationDialogProps {
  open: boolean;
  employeeName: string;
  impact: EmployeeDeactivationImpact | null;
  loading?: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const formatDate = (value: string | null): string => {
  if (!value) {
    return "—";
  }
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) {
    return value;
  }
  return `${day}/${month}/${year}`;
};

const formatSchedule = (start: string | null, end: string | null): string => {
  if (!start && !end) {
    return "—";
  }
  if (start && end) {
    return `${start} – ${end}`;
  }
  return start ?? end ?? "—";
};

export function EmployeeDeactivationDialog({
  open,
  employeeName,
  impact,
  loading = false,
  errorMessage = null,
  onConfirm,
  onCancel,
}: EmployeeDeactivationDialogProps) {
  const worker = terminology.worker.singular.toLowerCase();

  return (
    <Modal
      opened={open}
      onClose={loading ? () => undefined : onCancel}
      title="Desactivar colaborador"
      size="xl"
      centered
      withinPortal={false}
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
    >
      <Stack gap="md">
        <Text size="sm">
          <Text span fw={600}>
            {employeeName}
          </Text>{" "}
          está asignado a operaciones activas o programadas. Al continuar, será desasignado de las
          siguientes actividades y quedará inactivo.
        </Text>
        {impact ? (
          <Text size="sm" c="dimmed">
            {buildDeactivationSummaryMessage(impact)}
          </Text>
        ) : null}

        {impact && impact.affectedAssignments.length > 0 ? (
          <Table.ScrollContainer minWidth={720}>
            <Table striped highlightOnHover withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Operación</Table.Th>
                  <Table.Th>Fecha</Table.Th>
                  <Table.Th>Estado</Table.Th>
                  <Table.Th>Tipo</Table.Th>
                  <Table.Th>Ubicación</Table.Th>
                  <Table.Th>Horario</Table.Th>
                  <Table.Th>Grupo</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {impact.affectedAssignments.map((row) => (
                  <Table.Tr key={`${row.assignmentId}-${row.workdayId ?? row.date ?? "na"}`}>
                    <Table.Td>{row.operationName}</Table.Td>
                    <Table.Td>{formatDate(row.date)}</Table.Td>
                    <Table.Td>
                      {operationStatusLabels[row.status as keyof typeof operationStatusLabels] ??
                        row.status}
                    </Table.Td>
                    <Table.Td>
                      {operationKindLabels[row.operationType] ?? row.operationType}
                    </Table.Td>
                    <Table.Td>{row.locationName}</Table.Td>
                    <Table.Td>{formatSchedule(row.startTime, row.endTime)}</Table.Td>
                    <Table.Td>{row.workTeamName ?? "—"}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        ) : null}

        {impact && impact.activeWorkTeamMemberships.length > 0 ? (
          <Text size="sm" c="dimmed">
            También se quitará al {worker} de{" "}
            {impact.activeWorkTeamMemberships.map((team) => team.workTeamName).join(", ")}.
          </Text>
        ) : null}

        <FormErrorAlert message={errorMessage} />

        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button color="danger" onClick={onConfirm} loading={loading} disabled={loading}>
            Desactivar y desasignar
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
