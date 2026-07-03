import { zodResolver } from "@hookform/resolvers/zod";
import { Stack } from "@mantine/core";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { EMPLOYEE_TYPES } from "../../constants/employee-types";
import { terminology } from "../../domain/terminology";
import {
  FormActions,
  FormErrorAlert,
  FormGrid,
  FormSection,
  RHFPhoneInput,
  RHFSelect,
  RHFSwitch,
  RHFTextInput,
} from "../../design-system";
import { employeeFormSchema, type EmployeeFormInputValues, type EmployeeFormValues } from "../../schemas/employee.schema";
import { employeeTypeLabels } from "../../utils/labels";

interface EmployeeFormProps {
  defaultValues: EmployeeFormInputValues;
  submitLabel: string;
  cancelTo: string;
  onCancel?: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  onSubmit: (values: EmployeeFormValues) => Promise<void>;
}

export function EmployeeForm({
  defaultValues,
  submitLabel,
  cancelTo,
  onCancel,
  loading = false,
  errorMessage,
  onSubmit,
}: EmployeeFormProps) {
  const employeeTypeOptions = useMemo(
    () =>
      EMPLOYEE_TYPES.map((employeeType) => ({
        value: employeeType,
        label: employeeTypeLabels[employeeType],
      })),
    [],
  );

  const workerTypeLabel = `Tipo de ${terminology.worker.singular.toLowerCase()}`;

  const { control, handleSubmit } = useForm<EmployeeFormInputValues, unknown, EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FormSection>
        <Stack gap="md">
          <FormErrorAlert message={errorMessage} />

          <FormGrid>
            <RHFTextInput control={control} name="name" label="Nombre" required />
            <RHFTextInput control={control} name="documentNumber" label="Documento" />
            <RHFPhoneInput
              control={control}
              name="phoneNumber"
              label="Teléfono"
              placeholder="+5491112345678"
              description="Formato internacional E.164"
              required
            />
            <RHFSelect
              control={control}
              name="employeeType"
              label={workerTypeLabel}
              placeholder="Seleccionar tipo"
              data={employeeTypeOptions}
              required
            />
          </FormGrid>

          <RHFSwitch control={control} name="active" label="Activo" />

          <FormActions submitLabel={submitLabel} cancelTo={cancelTo} onCancel={onCancel} loading={loading} />
        </Stack>
      </FormSection>
    </form>
  );
}
