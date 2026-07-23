import { Badge, Button, Group, Paper, Stack, Text } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { getEmployeeById } from "../../api/employees.api";
import type { Employee } from "../../types/employee";
import {
  buildEmployeeByIdMap,
  getMissingSelectedEmployeeIds,
  resolveSelectedEmployeeDisplay,
} from "../../utils/work-team-member-display";
import { EmployeeSearchAutocomplete } from "../employees/EmployeeSearchAutocomplete";

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
  const [fetchedEmployees, setFetchedEmployees] = useState<Map<string, Employee>>(new Map());
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());

  const employeeById = useMemo(() => {
    const next = buildEmployeeByIdMap(existingMembers);
    for (const [employeeId, employee] of fetchedEmployees) {
      next.set(employeeId, employee);
    }
    return next;
  }, [existingMembers, fetchedEmployees]);

  const missingEmployeeIds = useMemo(
    () => getMissingSelectedEmployeeIds(selectedEmployeeIds, employeeById, unavailableIds),
    [selectedEmployeeIds, employeeById, unavailableIds],
  );

  const loadingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const employeeId of missingEmployeeIds) {
      if (!employeeById.has(employeeId) && !unavailableIds.has(employeeId)) {
        ids.add(employeeId);
      }
    }
    return ids;
  }, [missingEmployeeIds, employeeById, unavailableIds]);

  useEffect(() => {
    if (missingEmployeeIds.length === 0) {
      return;
    }

    let cancelled = false;

    void Promise.all(
      missingEmployeeIds.map(async (employeeId) => {
        try {
          const employee = await getEmployeeById(employeeId);
          if (cancelled) {
            return;
          }
          setFetchedEmployees((current) => new Map(current).set(employeeId, employee));
        } catch {
          if (!cancelled) {
            setUnavailableIds((current) => new Set(current).add(employeeId));
          }
        }
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [missingEmployeeIds]);

  const handleEmployeeSelected = (employee: Employee) => {
    setFetchedEmployees((current) => new Map(current).set(employee.id, employee));
    if (selectedEmployeeIds.includes(employee.id)) {
      return;
    }
    onChange([...selectedEmployeeIds, employee.id]);
  };

  const handleRemove = (employeeId: string) => {
    onChange(selectedEmployeeIds.filter((id) => id !== employeeId));
  };

  return (
    <Stack gap="sm">
      <EmployeeSearchAutocomplete
        label="Agregar colaborador"
        value={null}
        onChange={() => {}}
        onEmployeeSelected={handleEmployeeSelected}
        excludeIds={selectedEmployeeIds}
        activeOnly
        descriptionMode="assignment"
        placeholder="Buscar colaborador activo"
      />
      <Stack gap="xs" role="list" aria-label="Integrantes seleccionados">
        {selectedEmployeeIds.length === 0 ? (
          <Text size="sm" c="dimmed">
            No hay colaboradores seleccionados.
          </Text>
        ) : (
          selectedEmployeeIds.map((employeeId) => {
            const display = resolveSelectedEmployeeDisplay(
              employeeId,
              employeeById,
              loadingIds,
              unavailableIds,
            );

            return (
              <Paper key={employeeId} withBorder radius="md" p="sm" role="listitem">
                <Group justify="space-between" wrap="nowrap" gap="sm" align="flex-start">
                  <Stack gap={2} style={{ minWidth: 0, flex: 1 }}>
                    <Text size="sm" fw={500} lineClamp={2}>
                      {display.name}
                    </Text>
                    {display.secondary ? (
                      <Text size="xs" c="dimmed" lineClamp={2}>
                        {display.secondary}
                      </Text>
                    ) : null}
                  </Stack>
                  <Group gap="xs" wrap="nowrap">
                    {display.isInactive ? <Badge color="gray">Inactivo</Badge> : null}
                    {!display.isLoading ? (
                      <Button
                        variant="light"
                        color="red"
                        size="compact-sm"
                        aria-label={`Quitar a ${display.name}`}
                        onClick={() => handleRemove(employeeId)}
                      >
                        Quitar
                      </Button>
                    ) : null}
                  </Group>
                </Group>
              </Paper>
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
