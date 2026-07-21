import { zodResolver } from "@hookform/resolvers/zod";
import { Box, Input, Stack } from "@mantine/core";
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
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { employeeFormSchema, type EmployeeFormInputValues, type EmployeeFormValues } from "../../schemas/employee.schema";
import { employeeTypeLabels } from "../../utils/labels";
import { hasPermission } from "../../utils/permissions";
import { EmployeeCategorySelect } from "./EmployeeCategorySelect";

interface EmployeeFormProps {
  defaultValues: EmployeeFormInputValues;
  submitLabel: string;
  cancelTo: string;
  onCancel?: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  retainedCategory?: { id: string; name: string } | null;
  onSubmit: (values: EmployeeFormValues) => Promise<void>;
}

export function EmployeeForm({
  defaultValues,
  submitLabel,
  cancelTo,
  onCancel,
  loading = false,
  errorMessage,
  retainedCategory = null,
  onSubmit,
}: EmployeeFormProps) {
  const permissionsQuery = useCompanyPermissions();
  const canCreateCategories = hasPermission(
    permissionsQuery.data?.permissions,
    "company:settings:update",
  );

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
    <Box w="100%">
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <FormSection>
          <Stack gap="md">
            <FormErrorAlert message={errorMessage} />

            <FormGrid align="start">
              <RHFTextInput control={control} name="name" label="Nombre" required />
              <RHFTextInput control={control} name="documentNumber" label="Documento" />
              <RHFPhoneInput
                control={control}
                name="phoneNumber"
                label="Teléfono"
                placeholder="+5491112345678"
                description="Formato internacional E.164"
                inputWrapperOrder={["label", "input", "description", "error"]}
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
              <EmployeeCategorySelect
                control={control}
                name="categoryId"
                canCreate={canCreateCategories}
                disabled={loading}
                retainedCategory={retainedCategory}
              />
              <Input.Wrapper label="Estado activo" inputWrapperOrder={["label", "input", "error"]}>
                <Box
                  mih={36}
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <RHFSwitch control={control} name="active" label="Activo" />
                </Box>
              </Input.Wrapper>
            </FormGrid>

            <FormActions submitLabel={submitLabel} cancelTo={cancelTo} onCancel={onCancel} loading={loading} />
          </Stack>
        </FormSection>
      </form>
    </Box>
  );
}
