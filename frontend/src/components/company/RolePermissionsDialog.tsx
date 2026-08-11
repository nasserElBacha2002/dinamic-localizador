import { Alert, Badge, Button, Group, Stack, Text, Title } from "@mantine/core";
import { useMemo } from "react";
import { ErrorState, LoadingState, ResponsiveModal, StatusBadge } from "../../design-system";
import { useRoleCapabilities } from "../../hooks/useCompanyUsers";
import type { CompanyRole } from "../../types/company-user";
import type { RoleCapabilityPermission } from "../../types/role-capabilities";
import { getApiErrorMessage } from "../../utils/errors";
import { companyRoleLabels } from "../../utils/labels";

export interface RolePermissionsDialogProps {
  opened: boolean;
  onClose: () => void;
  role: CompanyRole | null | undefined;
}

function groupPermissionsByModule(
  permissions: RoleCapabilityPermission[],
): Array<{ module: string; permissions: RoleCapabilityPermission[] }> {
  const groups = new Map<string, RoleCapabilityPermission[]>();
  for (const permission of permissions) {
    const list = groups.get(permission.module) ?? [];
    list.push(permission);
    groups.set(permission.module, list);
  }
  return [...groups.entries()]
    .map(([module, modulePermissions]) => ({ module, permissions: modulePermissions }))
    .sort((left, right) => left.module.localeCompare(right.module, "es"));
}

/**
 * Informational dialog describing a company role's permissions and restrictions.
 * Safe to nest above CompanyUserDialog (higher z-index + own focus trap).
 */
export function RolePermissionsDialog({ opened, onClose, role }: RolePermissionsDialogProps) {
  const capabilitiesQuery = useRoleCapabilities(role, opened);
  // Guard against stale cache payloads if the selected role changes mid-flight.
  const capabilities =
    role && capabilitiesQuery.data?.role === role ? capabilitiesQuery.data : undefined;
  const grouped = useMemo(
    () => groupPermissionsByModule(capabilities?.permissions ?? []),
    [capabilities?.permissions],
  );

  const titleRole =
    capabilities?.name ?? (role ? companyRoleLabels[role] : null) ?? "rol";

  return (
    <ResponsiveModal
      opened={opened}
      onClose={onClose}
      title={`Permisos del rol: ${titleRole}`}
      size="lg"
      bodyMode="scroll"
      zIndex={400}
      withinPortal
      closeOnClickOutside
      closeOnEscape
      footer={
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            Cerrar
          </Button>
        </Group>
      }
    >
      {!role ? (
        <Text size="sm" c="dimmed">
          Seleccioná un rol para consultar sus permisos.
        </Text>
      ) : null}

      {role && capabilitiesQuery.isLoading && !capabilities ? (
        <LoadingState message="Cargando permisos del rol..." />
      ) : null}

      {role && capabilitiesQuery.isError && !capabilities ? (
        <Stack gap="sm">
          <ErrorState
            message={getApiErrorMessage(
              capabilitiesQuery.error,
              "No se pudieron cargar los permisos del rol.",
            )}
          />
          <Button variant="light" onClick={() => void capabilitiesQuery.refetch()}>
            Reintentar
          </Button>
        </Stack>
      ) : null}

      {role && capabilities ? (
        <Stack gap="md">
          <Stack gap={4}>
            <Group gap="sm" wrap="wrap">
              <Title order={4}>{capabilities.name}</Title>
              {capabilities.isSystemRole ? (
                <Badge variant="light" color="gray">
                  Rol del sistema
                </Badge>
              ) : null}
              <StatusBadge label={capabilities.role} tone="neutral" variant="light" />
            </Group>
            <Text size="sm" c="dimmed">
              {capabilities.description}
            </Text>
          </Stack>

          <Alert color="yellow" variant="light" title="Restricciones importantes">
            <Stack gap={6}>
              {capabilities.restrictions.map((restriction) => (
                <Text key={restriction.code} size="sm" data-restriction-code={restriction.code}>
                  {restriction.message}
                </Text>
              ))}
            </Stack>
          </Alert>

          {grouped.length === 0 ? (
            <Text size="sm" c="dimmed">
              Este rol no tiene permisos configurados.
            </Text>
          ) : (
            <Stack gap="md">
              {grouped.map((group) => (
                <Stack key={group.module} gap="xs">
                  <Text fw={600} size="sm">
                    {group.module}
                  </Text>
                  <Stack gap={6}>
                    {group.permissions.map((permission) => (
                      <Stack key={permission.code} gap={2}>
                        <Group gap="xs" wrap="nowrap" align="flex-start">
                          <Text c="teal" aria-hidden>
                            ✓
                          </Text>
                          <div>
                            <Text size="sm">{permission.label}</Text>
                            <Text size="xs" c="dimmed">
                              {permission.description}
                            </Text>
                            <Text size="xs" c="dimmed" ff="monospace">
                              {permission.code}
                            </Text>
                          </div>
                        </Group>
                      </Stack>
                    ))}
                  </Stack>
                </Stack>
              ))}
            </Stack>
          )}
        </Stack>
      ) : null}
    </ResponsiveModal>
  );
}
