import { zodResolver } from "@hookform/resolvers/zod";
import { Alert, FormControlLabel, Stack, Switch, TextField } from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { employeeFormSchema, type EmployeeFormValues } from "../../schemas/employee.schema";
import { FormActions } from "../common/FormActions";

interface EmployeeFormProps {
  defaultValues: EmployeeFormValues;
  submitLabel: string;
  cancelTo: string;
  loading?: boolean;
  errorMessage?: string | null;
  onSubmit: (values: EmployeeFormValues) => Promise<void>;
}

export function EmployeeForm({
  defaultValues,
  submitLabel,
  cancelTo,
  loading = false,
  errorMessage,
  onSubmit,
}: EmployeeFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues,
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack spacing={2} maxWidth={560}>
        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <TextField
          label="Nombre"
          required
          fullWidth
          error={Boolean(errors.name)}
          helperText={errors.name?.message}
          {...register("name")}
        />

        <TextField
          label="Documento"
          fullWidth
          error={Boolean(errors.documentNumber)}
          helperText={errors.documentNumber?.message}
          {...register("documentNumber")}
        />

        <TextField
          label="Teléfono"
          required
          fullWidth
          placeholder="+5491112345678"
          error={Boolean(errors.phoneNumber)}
          helperText={errors.phoneNumber?.message ?? "Formato internacional E.164"}
          {...register("phoneNumber")}
        />

        <Controller
          name="active"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={<Switch checked={field.value} onChange={field.onChange} inputRef={field.ref} />}
              label="Activo"
            />
          )}
        />

        <FormActions submitLabel={submitLabel} cancelTo={cancelTo} loading={loading} />
      </Stack>
    </form>
  );
}
