import { Badge, Group, Stack, Text } from "@mantine/core";
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
  const [employeeById, setEmployeeById] = useState<Map<string, Employee>>(() =>
    buildEmployeeByIdMap(existingMembers),
  );
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [unavailableIds, setUnavailableIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setEmployeeById((current) => {
      const next = new Map(current);
      for (const member of existingMembers) {
        next.set(member.id, member);
      }
      return next;
    });
  }, [existingMembers]);

  const missingEmployeeIds = useMemo(
    () => getMissingSelectedEmployeeIds(selectedEmployeeIds, employeeById, unavailableIds),
    [selectedEmployeeIds, employeeById, unavailableIds],
  );

  useEffect(() => {
    if (missingEmployeeIds.length === 0) {
      return;
    }

    let cancelled = false;
    setLoadingIds((current) => new Set([...current, ...missingEmployeeIds]));

    void Promise.all(
      missingEmployeeIds.map(async (employeeId) => {
        try {
          const employee = await getEmployeeById(employeeId);
          if (cancelled) {
            return;
          }
          setEmployeeById((current) => new Map(current).set(employeeId, employee));
        } catch {
          if (!cancelled) {
            setUnavailableIds((current) => new Set(current).add(employeeId));
          }
        } finally {
          if (!cancelled) {
            setLoadingIds((current) => {
              const next = new Set(current);
              next.delete(employeeId);
              return next;
            });
          }
        }
      }),
    );

    return () => {
      cancelled = true;
    };
  }, [missingEmployeeIds]);

  const handleEmployeeSelected = (employee: Employee) => {
    setEmployeeById((current) => new Map(current).set(employee.id, employee));
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
      <Stack gap="xs">
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
              <Group key={employeeId} justify="space-between" wrap="nowrap">
                <Stack gap={0}>
                  <Text size="sm" fw={500}>
                    {display.name}
                  </Text>
                  {display.secondary ? (
                    <Text size="xs" c="dimmed">
                      {display.secondary}
                    </Text>
                  ) : null}
                </Stack>
                <Group gap="xs">
                  {display.isInactive ? <Badge color="gray">Inactivo</Badge> : null}
                  {!display.isLoading ? (
                    <Badge
                      variant="light"
                      color="red"
                      style={{ cursor: "pointer" }}
                      onClick={() => handleRemove(employeeId)}
                    >
                      Quitar
                    </Badge>
                  ) : null}
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
