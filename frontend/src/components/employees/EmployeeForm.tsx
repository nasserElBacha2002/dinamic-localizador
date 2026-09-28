import { zodResolver } from "@hookform/resolvers/zod";
import { Box, Input, MultiSelect, Stack } from "@mantine/core";
import { useEffect, useMemo, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { useClients } from "../../hooks/useClients";
import { employeeFormSchema, type EmployeeFormInputValues, type EmployeeFormValues } from "../../schemas/employee.schema";
import { employeeTypeLabels } from "../../utils/labels";
import { hasAnyPermission, hasPermission } from "../../utils/permissions";
import { EmployeeCategorySelect } from "./EmployeeCategorySelect";
import { EmployeeLocationZoneSelect } from "./EmployeeLocationZoneSelect";

interface EmployeeFormProps {
  defaultValues: EmployeeFormInputValues;
  submitLabel: string;
  cancelTo: string;
  onCancel?: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  retainedCategory?: { id: string; name: string } | null;
  retainedLocationZone?: { id: string; name: string; locality?: string | null } | null;
  /** Reports dirty state to the page-level unsaved controller (edit routes only). */
  onDirtyChange?: (dirty: boolean) => void;
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
  retainedLocationZone = null,
  onDirtyChange,
  onSubmit,
}: EmployeeFormProps) {
  const permissionsQuery = useCompanyPermissions();
  const clientsQuery = useClients();
  const initiallyAssociatedClientIds = useRef(new Set(defaultValues.clientIds ?? [])).current;
  const canCreateCategories = hasPermission(
    permissionsQuery.data?.permissions,
    "company:settings:update",
  );
  const canCreateLocationZones = hasAnyPermission(permissionsQuery.data?.permissions, [
    "employees:manage",
    "company:settings:update",
  ]);

  const employeeTypeOptions = useMemo(
    () =>
      EMPLOYEE_TYPES.map((employeeType) => ({
        value: employeeType,
        label: employeeTypeLabels[employeeType],
      })),
    [],
  );

  const workerTypeLabel = `Tipo de ${terminology.worker.singular.toLowerCase()}`;
  const clientOptions = useMemo(
    () => (clientsQuery.data?.data ?? []).map((client) => ({
      value: client.id,
      label: client.isActive ? client.name : `${client.name} (inactivo)`,
      inactive: !client.isActive,
    })),
    [clientsQuery.data],
  );

  const {
    control,
    handleSubmit,
    formState: { isDirty },
  } = useForm<EmployeeFormInputValues, unknown, EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues,
  });

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

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
              <EmployeeLocationZoneSelect
                control={control}
                name="locationZoneId"
                canCreate={canCreateLocationZones}
                disabled={loading}
                retainedZone={retainedLocationZone}
              />
              <Input.Wrapper label="Estado activo" inputWrapperOrder={["label", "input", "error"]}>
                <Box
                  mih={36}
                  style={{ display: "flex", alignItems: "center" }}
                >
                  <RHFSwitch control={control} name="active" label="Activo" />
                </Box>
              </Input.Wrapper>
              <Controller
                control={control}
                name="clientIds"
                render={({ field, fieldState }) => (
                  <MultiSelect
                    label="Clientes"
                    placeholder={clientsQuery.isLoading ? "Cargando clientes..." : "Seleccioná uno o más clientes"}
                    data={clientOptions.map(({ value, label }) => ({ value, label }))}
                    value={field.value ?? []}
                    onChange={(nextValue) => {
                      const allowed = nextValue.filter((clientId) => {
                        const option = clientOptions.find((candidate) => candidate.value === clientId);
                        return option?.inactive !== true || initiallyAssociatedClientIds.has(clientId);
                      });
                      field.onChange(allowed);
                    }}
                    searchable
                    clearable
                    error={fieldState.error?.message}
                    disabled={loading || clientsQuery.isLoading}
                    nothingFoundMessage="No se encontraron clientes"
                  />
                )}
              />
            </FormGrid>

            <FormActions submitLabel={submitLabel} cancelTo={cancelTo} onCancel={onCancel} loading={loading} />
          </Stack>
        </FormSection>
      </form>
    </Box>
  );
}
