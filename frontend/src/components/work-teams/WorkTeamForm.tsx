import { Button, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useEffect, useState } from "react";
import { SectionCard } from "../../design-system";
import { WorkTeamMemberMultiSelect } from "./WorkTeamMemberMultiSelect";
import type { Employee } from "../../types/employee";

export interface WorkTeamFormValues {
  name: string;
  description: string;
  employeeIds: string[];
}

interface WorkTeamFormProps {
  defaultValues: WorkTeamFormValues;
  existingMembers?: Employee[];
  submitLabel: string;
  loading?: boolean;
  errorMessage?: string | null;
  onSubmit: (values: WorkTeamFormValues) => Promise<void>;
  onCancel: () => void;
}

export function WorkTeamForm({
  defaultValues,
  existingMembers = [],
  submitLabel,
  loading = false,
  errorMessage,
  onSubmit,
  onCancel,
}: WorkTeamFormProps) {
  const [name, setName] = useState(defaultValues.name);
  const [description, setDescription] = useState(defaultValues.description);
  const [employeeIds, setEmployeeIds] = useState(defaultValues.employeeIds);

  useEffect(() => {
    setName(defaultValues.name);
    setDescription(defaultValues.description);
    setEmployeeIds(defaultValues.employeeIds);
  }, [defaultValues]);

  return (
    <SectionCard title="Datos del grupo" description="Plantilla reutilizable de colaboradores.">
      <Stack gap="md">
        <TextInput
          label="Nombre"
          required
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Textarea
          label="Descripción"
          value={description}
          onChange={(event) => setDescription(event.currentTarget.value)}
          minRows={2}
        />
        <WorkTeamMemberMultiSelect
          selectedEmployeeIds={employeeIds}
          onChange={setEmployeeIds}
          existingMembers={existingMembers}
        />
        {errorMessage ? (
          <Text size="sm" c="red">
            {errorMessage}
          </Text>
        ) : null}
        <Stack gap="xs">
          <Button
            onClick={() =>
              onSubmit({
                name: name.trim(),
                description: description.trim(),
                employeeIds,
              })
            }
            loading={loading}
          >
            {submitLabel}
          </Button>
          <Button variant="default" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
        </Stack>
      </Stack>
    </SectionCard>
  );
}
