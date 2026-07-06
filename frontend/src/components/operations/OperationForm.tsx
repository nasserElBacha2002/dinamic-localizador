import { zodResolver } from "@hookform/resolvers/zod";
import { Box, Paper, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useEffect, useMemo } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { WeeklyScheduleEditor } from "../schedules/WeeklyScheduleEditor";
import { WeeklySchedulePreview } from "../schedules/WeeklySchedulePreview";
import {
  FormActions,
  FormErrorAlert,
  FormGrid,
  FormSection,
  RHFDateTimeInput,
  RHFNumberInput,
  RHFSelect,
  RHFTextarea,
} from "../../design-system";
import {
  createOperationFormSchema,
  operationFormSchema,
  type OperationFormValues,
} from "../../schemas/operation.schema";
import type { OperationKind, OperationStatus } from "../../types/operation";
import type { CompanyWorkSchedule } from "../../types/schedule";
import { getCurrentDatetimeLocal } from "../../utils/dates";
import { getAllowedStatusOptions, isOperationEditable } from "../../utils/operation-status";
import {
  buildCompanySchedulePreviewLabel,
  operationKindLabels,
  scheduleSourceLabels,
} from "../../utils/operation-schedule-display";
import { operationStatusLabels } from "../../utils/labels";
import { ServiceSearchAutocomplete } from "../services/ServiceSearchAutocomplete";

export const OPERATION_DETAIL_FORM_ID = "operation-detail-form";

interface OperationFormProps {
  mode: "create" | "edit";
  defaultValues: OperationFormValues;
  currentStatus?: OperationStatus;
  currentOperationKind?: OperationKind;
  companyWorkSchedule?: CompanyWorkSchedule | null;
  submitLabel: string;
  cancelTo: string;
  onCancel?: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  onSubmit: (values: OperationFormValues) => Promise<void>;
  embedded?: boolean;
  formId?: string;
  hideActions?: boolean;
}

function OperationKindCard({
  selected,
  title,
  description,
  onClick,
  disabled,
}: {
  selected: boolean;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <UnstyledButton onClick={onClick} disabled={disabled} style={{ width: "100%" }}>
      <Paper
        withBorder
        p="md"
        style={{
          borderColor: selected ? "var(--mantine-color-blue-6)" : undefined,
          background: selected ? "var(--mantine-color-blue-0)" : undefined,
        }}
      >
        <Text fw={600} size="sm">
          {title}
        </Text>
        <Text size="xs" c="dimmed" mt={4}>
          {description}
        </Text>
      </Paper>
    </UnstyledButton>
  );
}

export function OperationForm({
  mode,
  defaultValues,
  currentStatus = "SCHEDULED",
  currentOperationKind,
  companyWorkSchedule = null,
  submitLabel,
  cancelTo,
  onCancel,
  loading = false,
  errorMessage,
  onSubmit,
  embedded = false,
  formId,
  hideActions = false,
}: OperationFormProps) {
  const validationSchema = useMemo(
    () => (mode === "create" ? createOperationFormSchema : operationFormSchema),
    [mode],
  );

  const { control, handleSubmit, reset, setValue } = useForm<OperationFormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues,
  });

  const operationKind = useWatch({ control, name: "operationKind" });
  const scheduleSource = useWatch({ control, name: "scheduleSource" });
  const lockedKind = mode === "edit" ? (currentOperationKind ?? operationKind) : operationKind;

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const statusOptions = useMemo(
    () =>
      mode === "edit"
        ? getAllowedStatusOptions(currentStatus).map((status) => ({
            value: status,
            label: operationStatusLabels[status],
          }))
        : [],
    [currentStatus, mode],
  );

  const serviceFieldDisabled = mode === "edit" && !isOperationEditable(currentStatus);
  const minScheduledStart = mode === "create" ? getCurrentDatetimeLocal() : undefined;

  const formContent = (
    <Stack gap="md">
      <FormErrorAlert message={errorMessage} />

      {mode === "edit" ? (
        <Box>
          <Text size="sm" fw={500} mb={4}>
            Tipo de operación
          </Text>
          <Text size="sm">{operationKindLabels[lockedKind]}</Text>
          <Text size="xs" c="dimmed" mt={4}>
            El tipo de operación no puede modificarse después de crearla.
          </Text>
        </Box>
      ) : (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Tipo de operación
          </Text>
          <FormGrid>
            <Controller
              name="operationKind"
              control={control}
              render={({ field }) => (
                <>
                  <FormGrid.Full>
                    <OperationKindCard
                      selected={field.value === "ONE_TIME"}
                      title="Fecha específica"
                      description="Para trabajos programados en una fecha y horario concretos."
                      onClick={() => field.onChange("ONE_TIME")}
                    />
                  </FormGrid.Full>
                  <FormGrid.Full>
                    <OperationKindCard
                      selected={field.value === "RECURRING"}
                      title="Trabajo habitual"
                      description="Para colaboradores que fichan regularmente según un horario semanal."
                      onClick={() => field.onChange("RECURRING")}
                    />
                  </FormGrid.Full>
                </>
              )}
            />
          </FormGrid>
        </Stack>
      )}

      <FormGrid>
        <FormGrid.Full>
          <Controller
            name="serviceId"
            control={control}
            render={({ field, fieldState }) => (
              <ServiceSearchAutocomplete
                value={field.value || null}
                onChange={(serviceId) => field.onChange(serviceId ?? "")}
                activeOnly={mode === "create"}
                error={Boolean(fieldState.error)}
                helperText={fieldState.error?.message ?? "Buscá por nombre o dirección"}
                disabled={serviceFieldDisabled}
                required
              />
            )}
          />
        </FormGrid.Full>
      </FormGrid>

      <Text size="xs" c="dimmed">
        Zona horaria: America/Argentina/Buenos_Aires
      </Text>

      {lockedKind === "ONE_TIME" ? (
        <FormGrid>
          <RHFDateTimeInput
            control={control}
            name="scheduledStart"
            label="Inicio programado"
            required
            min={minScheduledStart}
          />
          <RHFDateTimeInput control={control} name="scheduledEnd" label="Fin programado" />
        </FormGrid>
      ) : (
        <Stack gap="md">
          <FormGrid>
            <Controller
              name="validFrom"
              control={control}
              render={({ field, fieldState }) => (
                <TextInput
                  type="date"
                  label="Desde"
                  required
                  value={field.value}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                  disabled={serviceFieldDisabled}
                />
              )}
            />
            <Controller
              name="validUntil"
              control={control}
              render={({ field, fieldState }) => (
                <TextInput
                  type="date"
                  label="Hasta"
                  description="Sin fecha de finalización"
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  error={fieldState.error?.message}
                  disabled={serviceFieldDisabled}
                />
              )}
            />
          </FormGrid>

          <Stack gap="xs">
            <Text size="sm" fw={500}>
              Origen del horario
            </Text>
            <FormGrid>
              <Controller
                name="scheduleSource"
                control={control}
                render={({ field }) => (
                  <>
                    <FormGrid.Full>
                      <OperationKindCard
                        selected={field.value === "COMPANY"}
                        title="Usar horario de la empresa"
                        description="Los próximos días de trabajo usarán el horario semanal configurado para la empresa."
                        onClick={() => {
                          field.onChange("COMPANY");
                          setValue("scheduleDays", defaultValues.scheduleDays);
                        }}
                        disabled={serviceFieldDisabled}
                      />
                    </FormGrid.Full>
                    <FormGrid.Full>
                      <OperationKindCard
                        selected={field.value === "CUSTOM"}
                        title="Configurar horario específico"
                        description="Esta operación tendrá su propio horario semanal."
                        onClick={() => field.onChange("CUSTOM")}
                        disabled={serviceFieldDisabled}
                      />
                    </FormGrid.Full>
                  </>
                )}
              />
            </FormGrid>
          </Stack>

          {scheduleSource === "COMPANY" ? (
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Horario de la empresa
              </Text>
              {companyWorkSchedule ? (
                <>
                  <Text size="sm" c="dimmed">
                    {buildCompanySchedulePreviewLabel(companyWorkSchedule.days)}
                  </Text>
                  <WeeklySchedulePreview days={companyWorkSchedule.days} />
                </>
              ) : (
                <Text size="sm" c="dimmed">
                  La empresa no tiene un horario laboral semanal configurado.
                </Text>
              )}
            </Stack>
          ) : (
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                {scheduleSourceLabels.CUSTOM}
              </Text>
              <Controller
                name="scheduleDays"
                control={control}
                render={({ field, fieldState }) => (
                  <Stack gap={4}>
                    <WeeklyScheduleEditor
                      value={field.value as import("../../types/schedule").WeeklyScheduleDay[]}
                      onChange={field.onChange}
                      disabled={serviceFieldDisabled}
                      readOnly={mode === "edit" && serviceFieldDisabled}
                    />
                    {fieldState.error ? (
                      <Text size="xs" c="red">
                        {fieldState.error.message}
                      </Text>
                    ) : null}
                  </Stack>
                )}
              />
            </Stack>
          )}
        </Stack>
      )}

      <FormGrid>
        <RHFNumberInput
          control={control}
          name="earlyToleranceMinutes"
          label="Tolerancia temprana (minutos)"
          required
          min={0}
          step={1}
        />
        <RHFNumberInput
          control={control}
          name="lateToleranceMinutes"
          label="Tolerancia tardía (minutos)"
          required
          min={0}
          step={1}
        />
      </FormGrid>

      <FormGrid>
        <FormGrid.Full>
          <RHFTextarea control={control} name="notes" label="Notas" minRows={3} />
        </FormGrid.Full>
      </FormGrid>

      {mode === "edit" && statusOptions.length > 0 ? (
        <FormGrid>
          <FormGrid.Full>
            <RHFSelect control={control} name="status" label="Estado" data={statusOptions} />
          </FormGrid.Full>
        </FormGrid>
      ) : null}

      {!hideActions ? (
        <FormActions submitLabel={submitLabel} cancelTo={cancelTo} onCancel={onCancel} loading={loading} />
      ) : null}
    </Stack>
  );

  return (
    <form id={formId} onSubmit={handleSubmit(onSubmit)} noValidate>
      {embedded ? formContent : <FormSection>{formContent}</FormSection>}
    </form>
  );
}
