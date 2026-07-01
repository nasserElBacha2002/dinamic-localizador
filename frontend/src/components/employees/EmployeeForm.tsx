import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { EMPLOYEE_TYPES } from "../../constants/employee-types";
import { terminology } from "../../domain/terminology";
import { employeeFormSchema, type EmployeeFormInputValues, type EmployeeFormValues } from "../../schemas/employee.schema";
import { employeeTypeLabels } from "../../utils/labels";
import { FormActions } from "../common/FormActions";

interface EmployeeFormProps {
  defaultValues: EmployeeFormInputValues;
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
  } = useForm<EmployeeFormInputValues, unknown, EmployeeFormValues>({
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
          name="employeeType"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth required error={Boolean(errors.employeeType)}>
              <InputLabel id="employee-type-label">Tipo de {terminology.worker.singular.toLowerCase()}</InputLabel>
              <Select
                labelId="employee-type-label"
                label={`Tipo de ${terminology.worker.singular.toLowerCase()}`}
                value={field.value ?? ""}
                onChange={field.onChange}
                inputRef={field.ref}
              >
                <MenuItem value="" disabled>
                  <em>Seleccionar tipo</em>
                </MenuItem>
                {EMPLOYEE_TYPES.map((employeeType) => (
                  <MenuItem key={employeeType} value={employeeType}>
                    {employeeTypeLabels[employeeType]}
                  </MenuItem>
                ))}
              </Select>
              {errors.employeeType?.message ? (
                <FormHelperText>{errors.employeeType.message}</FormHelperText>
              ) : null}
            </FormControl>
          )}
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
