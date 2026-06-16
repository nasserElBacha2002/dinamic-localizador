import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from "@mui/material";
import { Controller, useForm } from "react-hook-form";
import { attendanceTestFormSchema, type AttendanceTestFormValues } from "../../schemas/attendance.schema";
import type { Employee } from "../../types/employee";
import type { InventoryWithStore } from "../../types/inventory";
import {
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";
import { FormActions } from "../common/FormActions";

interface AttendanceTestFormProps {
  inventories: InventoryWithStore[];
  employees: Employee[];
  defaultValues: AttendanceTestFormValues;
  submitLabel: string;
  cancelTo: string;
  loading?: boolean;
  errorMessage?: string | null;
  onSubmit: (values: AttendanceTestFormValues) => Promise<void>;
}

export function AttendanceTestForm({
  inventories,
  employees,
  defaultValues,
  submitLabel,
  cancelTo,
  loading = false,
  errorMessage,
  onSubmit,
}: AttendanceTestFormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AttendanceTestFormValues>({
    resolver: zodResolver(attendanceTestFormSchema),
    defaultValues,
  });

  const activeEmployees = employees.filter((employee) => employee.active);

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <Stack spacing={2} maxWidth={640}>
        <Alert severity="warning">
          Esta función es temporal y se utiliza únicamente para validar el modelo antes de integrar WhatsApp y Twilio.
        </Alert>

        {errorMessage ? <Alert severity="error">{errorMessage}</Alert> : null}

        <Controller
          name="inventoryId"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth required error={Boolean(errors.inventoryId)}>
              <InputLabel id="inventory-select-label">Inventario</InputLabel>
              <Select {...field} labelId="inventory-select-label" label="Inventario">
                {inventories.map((inventory) => (
                  <MenuItem key={inventory.id} value={inventory.id}>
                    {inventory.store.name} · {inventory.scheduledStart}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        />

        <Controller
          name="employeeId"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth required error={Boolean(errors.employeeId)}>
              <InputLabel id="employee-select-label">Empleado</InputLabel>
              <Select {...field} labelId="employee-select-label" label="Empleado">
                {activeEmployees.map((employee) => (
                  <MenuItem key={employee.id} value={employee.id}>
                    {employee.name} ({employee.phoneNumber})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        />

        <TextField
          label="Latitud recibida"
          type="number"
          required
          fullWidth
          inputProps={{ step: "any" }}
          error={Boolean(errors.receivedLatitude)}
          helperText={errors.receivedLatitude?.message}
          {...register("receivedLatitude", { valueAsNumber: true })}
        />

        <TextField
          label="Longitud recibida"
          type="number"
          required
          fullWidth
          inputProps={{ step: "any" }}
          error={Boolean(errors.receivedLongitude)}
          helperText={errors.receivedLongitude?.message}
          {...register("receivedLongitude", { valueAsNumber: true })}
        />

        <TextField
          label="Distancia (metros)"
          type="number"
          required
          fullWidth
          inputProps={{ step: "any" }}
          error={Boolean(errors.distanceMeters)}
          helperText={errors.distanceMeters?.message}
          {...register("distanceMeters", { valueAsNumber: true })}
        />

        <Controller
          name="validationStatus"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth>
              <InputLabel id="validation-status-label">Validación</InputLabel>
              <Select {...field} labelId="validation-status-label" label="Validación">
                {Object.entries(validationStatusLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        />

        <Controller
          name="locationStatus"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth>
              <InputLabel id="location-status-label">Ubicación</InputLabel>
              <Select {...field} labelId="location-status-label" label="Ubicación">
                {Object.entries(locationStatusLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        />

        <Controller
          name="punctualityStatus"
          control={control}
          render={({ field }) => (
            <FormControl fullWidth>
              <InputLabel id="punctuality-status-label">Puntualidad</InputLabel>
              <Select {...field} labelId="punctuality-status-label" label="Puntualidad">
                {Object.entries(punctualityStatusLabels).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}
        />

        <TextField
          label="Fecha y hora recibida"
          type="datetime-local"
          required
          fullWidth
          InputLabelProps={{ shrink: true }}
          error={Boolean(errors.receivedAt)}
          helperText={errors.receivedAt?.message}
          {...register("receivedAt")}
        />

        <TextField
          label="MessageSid (opcional)"
          fullWidth
          error={Boolean(errors.sourceMessageSid)}
          helperText={errors.sourceMessageSid?.message}
          {...register("sourceMessageSid")}
        />

        <TextField
          label="Motivo de validación (opcional)"
          fullWidth
          multiline
          minRows={2}
          error={Boolean(errors.validationReason)}
          helperText={errors.validationReason?.message}
          {...register("validationReason")}
        />

        <FormActions submitLabel={submitLabel} cancelTo={cancelTo} loading={loading} />
      </Stack>
    </form>
  );
}
