import { Button, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "../../design-system";
import { WorkTeamAiCreationPanel } from "./WorkTeamAiCreationPanel";
import { WorkTeamMemberMultiSelect } from "./WorkTeamMemberMultiSelect";
import type { Employee } from "../../types/employee";
import { areEmployeeIdSetsEqual } from "../../utils/work-team-save";
import type { WorkTeamFormValues } from "./work-team-form.types";

export type { WorkTeamFormValues } from "./work-team-form.types";

interface WorkTeamFormProps {
  defaultValues: WorkTeamFormValues;
  existingMembers?: Employee[];
  submitLabel: string;
  loading?: boolean;
  errorMessage?: string | null;
  /** Show AI composition assist (create flow). */
  enableAiAssist?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
  onSubmit: (values: WorkTeamFormValues) => Promise<void>;
  onCancel: () => void;
}

const buildFormKey = (values: WorkTeamFormValues): string =>
  `${values.name}|${values.description}|${values.employeeIds.join(",")}`;

export function WorkTeamForm(props: WorkTeamFormProps) {
  return <WorkTeamFormFields key={buildFormKey(props.defaultValues)} {...props} />;
}

function WorkTeamFormFields({
  defaultValues,
  existingMembers = [],
  submitLabel,
  loading = false,
  errorMessage,
  enableAiAssist = false,
  onDirtyChange,
  onSubmit,
  onCancel,
}: WorkTeamFormProps) {
  const [name, setName] = useState(defaultValues.name);
  const [description, setDescription] = useState(defaultValues.description);
  const [employeeIds, setEmployeeIds] = useState(defaultValues.employeeIds);

  const isDirty = useMemo(() => {
    return (
      name !== defaultValues.name ||
      description !== defaultValues.description ||
      !areEmployeeIdSetsEqual(employeeIds, defaultValues.employeeIds)
    );
  }, [name, description, employeeIds, defaultValues]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  return (
    <SectionCard title="Datos del grupo" description="Plantilla reutilizable de colaboradores.">
      <Stack gap="md">
        {enableAiAssist ? <WorkTeamAiCreationPanel onApplyMembers={setEmployeeIds} /> : null}
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
        <Stack gap="sm">
          <Button
            loading={loading}
            onClick={() => void onSubmit({ name, description, employeeIds })}
          >
            {submitLabel}
          </Button>
          <Button variant="default" onClick={onCancel}>
            Cancelar
          </Button>
        </Stack>
      </Stack>
    </SectionCard>
  );
}
