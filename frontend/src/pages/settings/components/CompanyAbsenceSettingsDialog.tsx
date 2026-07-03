import { NumberInput, Stack, Switch, Table, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import type { CompanyAbsenceSetting } from "../../../types/company-absence-settings";
import { SettingsDialog } from "./SettingsDialog";
import { useUpdateCompanyAbsenceSettings } from "../../../hooks/useCompanyAbsenceSettings";
import { getApiErrorMessage } from "../../../utils/errors";

type DraftSetting = {
  absenceTypeCode: string;
  absenceTypeName: string;
  isActive: boolean;
  defaultAnnualDays: number;
  autoAssignOnEmployeeCreate: boolean;
};

interface CompanyAbsenceSettingsDialogProps {
  opened: boolean;
  onClose: () => void;
  settings: CompanyAbsenceSetting[];
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

function toDraftSettings(settings: CompanyAbsenceSetting[]): DraftSetting[] {
  return settings.map((row) => ({ ...row }));
}

function draftSettingsEqual(left: DraftSetting[], right: DraftSetting[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((row, index) => {
    const other = right[index];
    return (
      row.absenceTypeCode === other.absenceTypeCode &&
      row.defaultAnnualDays === other.defaultAnnualDays &&
      row.autoAssignOnEmployeeCreate === other.autoAssignOnEmployeeCreate
    );
  });
}

export function CompanyAbsenceSettingsDialog({
  opened,
  onClose,
  settings,
  canUpdate,
  onSaved,
}: CompanyAbsenceSettingsDialogProps) {
  const updateMutation = useUpdateCompanyAbsenceSettings();
  const baseline = useMemo(() => toDraftSettings(settings), [settings]);
  const [draft, setDraft] = useState<DraftSetting[]>(() => toDraftSettings(settings));
  const [submitError, setSubmitError] = useState<string | null>(null);

  const hasChanges = !draftSettingsEqual(draft, baseline);
  const disabled = !canUpdate || updateMutation.isPending;

  const handleClose = () => {
    if (updateMutation.isPending) {
      return;
    }
    setDraft(baseline);
    setSubmitError(null);
    onClose();
  };

  const handleSave = async () => {
    if (!canUpdate || !hasChanges || updateMutation.isPending) {
      return;
    }

    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        settings: draft.map((row) => ({
          absenceTypeCode: row.absenceTypeCode,
          defaultAnnualDays: row.defaultAnnualDays,
          autoAssignOnEmployeeCreate: row.autoAssignOnEmployeeCreate,
        })),
      });
      onSaved("Configuración de ausencias guardada correctamente.");
      onClose();
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  return (
    <SettingsDialog
      opened={opened}
      onClose={handleClose}
      title="Ausencias"
      subtitle="Los saldos de ausencias se asignan a nuevos empleados. No modifican empleados existentes."
      onSave={handleSave}
      saving={updateMutation.isPending}
      saveDisabled={!hasChanges || disabled}
      submitError={submitError}
      size="lg"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Estos valores se usan al crear nuevos empleados. No modifican saldos existentes.
        </Text>

        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Tipo</Table.Th>
              <Table.Th>Días anuales</Table.Th>
              <Table.Th>Auto-asignar</Table.Th>
              <Table.Th>Estado</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {draft.map((row, index) => (
              <Table.Tr key={row.absenceTypeCode}>
                <Table.Td>
                  <Text size="sm">{row.absenceTypeName}</Text>
                  <Text size="xs" c="dimmed">
                    {row.absenceTypeCode}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    value={row.defaultAnnualDays}
                    onChange={(value) =>
                      setDraft((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                defaultAnnualDays:
                                  typeof value === "number" ? value : item.defaultAnnualDays,
                              }
                            : item,
                        ),
                      )
                    }
                    min={0}
                    max={365}
                    decimalScale={1}
                    step={0.5}
                    disabled={disabled || !row.isActive}
                    aria-label={`Días anuales ${row.absenceTypeName}`}
                  />
                </Table.Td>
                <Table.Td>
                  <Switch
                    checked={row.autoAssignOnEmployeeCreate}
                    onChange={(event) =>
                      setDraft((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index
                            ? {
                                ...item,
                                autoAssignOnEmployeeCreate: event.currentTarget.checked,
                              }
                            : item,
                        ),
                      )
                    }
                    disabled={disabled || !row.isActive}
                    aria-label={`Asignar automáticamente al crear empleado ${row.absenceTypeName}`}
                  />
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c={row.isActive ? "green" : "dimmed"}>
                    {row.isActive ? "Activo" : "Inactivo"}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Stack>
    </SettingsDialog>
  );
}
