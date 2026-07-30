import { Alert, Select, Stack, Table, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { useAbsenceCalendars } from "../../../hooks/useAbsenceCalendar";
import { useAbsenceTypes, useUpdateAbsenceType } from "../../../hooks/useAbsences";
import type { AbsenceAttachmentPolicy } from "../../../types/absence";
import {
  absenceAttachmentPolicyLabels,
  absenceTypeLabels,
} from "../../../utils/absence-labels";
import { getApiErrorMessage } from "../../../utils/errors";
import { SettingsDialog } from "./SettingsDialog";

interface CompanyAbsenceTypePolicyDialogProps {
  opened: boolean;
  onClose: () => void;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

const ATTACHMENT_POLICY_OPTIONS: Array<{ value: AbsenceAttachmentPolicy; label: string }> = [
  { value: "FORBIDDEN", label: absenceAttachmentPolicyLabels.FORBIDDEN },
  { value: "OPTIONAL", label: absenceAttachmentPolicyLabels.OPTIONAL },
  { value: "REQUIRED", label: absenceAttachmentPolicyLabels.REQUIRED },
];

function resolveAttachmentPolicy(type: {
  attachmentPolicy?: AbsenceAttachmentPolicy;
  requiresAttachment: boolean;
}): AbsenceAttachmentPolicy {
  return (
    type.attachmentPolicy ?? (type.requiresAttachment ? "REQUIRED" : "OPTIONAL")
  );
}

export function CompanyAbsenceTypePolicyDialog({
  opened,
  onClose,
  canUpdate,
  onSaved,
}: CompanyAbsenceTypePolicyDialogProps) {
  const typesQuery = useAbsenceTypes();
  const calendarsQuery = useAbsenceCalendars(opened);
  const updateMutation = useUpdateAbsenceType();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const calendarOptions = useMemo(() => {
    const options: Array<{ value: string; label: string }> = [
      { value: "", label: "Calendario por defecto de la empresa" },
    ];
    for (const calendar of calendarsQuery.data ?? []) {
      if (!calendar.isActive) {
        continue;
      }
      options.push({
        value: calendar.id,
        label: calendar.isDefault ? `${calendar.name} (default)` : calendar.name,
      });
    }
    return options;
  }, [calendarsQuery.data]);

  const handleModeChange = async (
    typeId: string,
    dayCountingMode: "CALENDAR_DAYS" | "BUSINESS_DAYS",
  ) => {
    if (!canUpdate) {
      return;
    }
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({ id: typeId, dayCountingMode });
      onSaved("Modo de conteo actualizado.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleCalendarChange = async (typeId: string, calendarId: string | null) => {
    if (!canUpdate) {
      return;
    }
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        id: typeId,
        calendarId: calendarId || null,
      });
      onSaved("Calendario del tipo actualizado.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleAttachmentPolicyChange = async (
    typeId: string,
    attachmentPolicy: AbsenceAttachmentPolicy,
  ) => {
    if (!canUpdate) {
      return;
    }
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({ id: typeId, attachmentPolicy });
      onSaved("Política de adjuntos actualizada.");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  return (
    <SettingsDialog
      opened={opened}
      onClose={onClose}
      title="Política de cálculo por tipo"
      subtitle="Definí si cada tipo usa días corridos o días hábiles, qué calendario aplica, y la política de adjuntos."
      onSave={() => onClose()}
      saveLabel="Cerrar"
      saving={false}
      saveDisabled={false}
      submitError={submitError}
      size="xl"
    >
      <Stack gap="md">
        <Alert color="blue">
          Los feriados y fines de semana solo afectan tipos configurados como días hábiles, y
          únicamente cuando el calendario avanzado está activo en la empresa.
        </Alert>
        {typesQuery.isError ? (
          <Alert color="red">{getApiErrorMessage(typesQuery.error)}</Alert>
        ) : null}
        <Table.ScrollContainer minWidth={860}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Tipo</Table.Th>
                <Table.Th>Modo de conteo</Table.Th>
                <Table.Th>Calendario</Table.Th>
                <Table.Th>Adjuntos</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {(typesQuery.data ?? []).map((type) => (
                <Table.Tr key={type.id}>
                  <Table.Td>
                    <Text size="sm" fw={600}>
                      {absenceTypeLabels[type.code as keyof typeof absenceTypeLabels] ??
                        type.name}
                    </Text>
                    <Text size="xs" c="dimmed">
                      {type.code}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      data={[
                        { value: "CALENDAR_DAYS", label: "Días corridos" },
                        { value: "BUSINESS_DAYS", label: "Días hábiles" },
                      ]}
                      value={type.dayCountingMode ?? "CALENDAR_DAYS"}
                      onChange={(value) =>
                        void handleModeChange(
                          type.id,
                          (value as "CALENDAR_DAYS" | "BUSINESS_DAYS") ?? "CALENDAR_DAYS",
                        )
                      }
                      disabled={!canUpdate || updateMutation.isPending}
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      data={calendarOptions}
                      value={type.calendarId ?? ""}
                      onChange={(value) =>
                        void handleCalendarChange(type.id, value ? value : null)
                      }
                      disabled={!canUpdate || updateMutation.isPending}
                      clearable
                    />
                  </Table.Td>
                  <Table.Td>
                    <Select
                      data={ATTACHMENT_POLICY_OPTIONS}
                      value={resolveAttachmentPolicy(type)}
                      onChange={(value) =>
                        void handleAttachmentPolicyChange(
                          type.id,
                          (value as AbsenceAttachmentPolicy) ?? "OPTIONAL",
                        )
                      }
                      disabled={!canUpdate || updateMutation.isPending}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>
    </SettingsDialog>
  );
}
