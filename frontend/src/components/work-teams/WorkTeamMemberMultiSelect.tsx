import { Badge, Group, Stack, Text } from "@mantine/core";
import { EmployeeSearchAutocomplete } from "../employees/EmployeeSearchAutocomplete";
import type { Employee } from "../../types/employee";
import { employeeTypeLabels, activeStatusLabel } from "../../utils/labels";

interface WorkTeamMemberMultiSelectProps {
  selectedEmployeeIds: string[];
  onChange: (employeeIds: string[]) => void;
  existingMembers?: Employee[];
}

export function WorkTeamMemberMultiSelect({
  selectedEmployeeIds,
  onChange,
  existingMembers = [],
}: WorkTeamMemberMultiSelectProps) {
  const inactiveExistingIds = new Set(
    existingMembers.filter((member) => !member.active).map((member) => member.id),
  );

  const handleAdd = (employeeId: string | null) => {
    if (!employeeId || selectedEmployeeIds.includes(employeeId)) {
      return;
    }
    onChange([...selectedEmployeeIds, employeeId]);
  };

  const handleRemove = (employeeId: string) => {
    onChange(selectedEmployeeIds.filter((id) => id !== employeeId));
  };

  return (
    <Stack gap="sm">
      <EmployeeSearchAutocomplete
        label="Agregar colaborador"
        value={null}
        onChange={handleAdd}
        excludeIds={selectedEmployeeIds}
        activeOnly
        descriptionMode="assignment"
        placeholder="Buscar colaborador activo"
      />
      <Stack gap="xs">
        {selectedEmployeeIds.length === 0 ? (
          <Text size="sm" c="dimmed">
            No hay colaboradores seleccionados.
          </Text>
        ) : (
          selectedEmployeeIds.map((employeeId) => {
            const member = existingMembers.find((item) => item.id === employeeId);
            const isInactive = inactiveExistingIds.has(employeeId) || member?.active === false;
            return (
              <Group key={employeeId} justify="space-between" wrap="nowrap">
                <Stack gap={0}>
                  <Text size="sm" fw={500}>
                    {member?.name ?? employeeId}
                  </Text>
                  <Text size="xs" c="dimmed">
                    {member ? employeeTypeLabels[member.employeeType] : "—"}
                    {isInactive ? ` · ${activeStatusLabel(false)}` : ""}
                  </Text>
                </Stack>
                <Group gap="xs">
                  {isInactive ? <Badge color="gray">Inactivo</Badge> : null}
                  <Badge
                    variant="light"
                    color="red"
                    style={{ cursor: "pointer" }}
                    onClick={() => handleRemove(employeeId)}
                  >
                    Quitar
                  </Badge>
                </Group>
              </Group>
            );
          })
        )}
      </Stack>
      <Text size="xs" c="dimmed">
        {selectedEmployeeIds.length} colaborador(es) seleccionado(s).
      </Text>
    </Stack>
  );
}
