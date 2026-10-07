import { zodResolver } from "@hookform/resolvers/zod";
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { WeeklyScheduleEditor } from "../schedules/WeeklyScheduleEditor";
import {
  FormActions,
  FormErrorAlert,
  FormGrid,
  FormSection,
  ResponsiveModal,
  RHFDateTimeInput,
  RHFNumberInput,
  RHFSelect,
} from "../../design-system";
import { useShiftTemplates } from "../../hooks/useShiftTemplates";
import {
  createOperationFormSchema,
  operationFormSchema,
  type OperationFormValues,
} from "../../schemas/operation.schema";
import type { OperationKind, OperationStatus } from "../../types/operation";
import type { CompanyWorkSchedule, WeeklyScheduleDay } from "../../types/schedule";
import { getCurrentDatetimeLocal } from "../../utils/dates";
import { getAllowedStatusOptions, isOperationEditable } from "../../utils/operation-status";
import { operationKindLabels } from "../../utils/operation-schedule-display";
import { operationStatusLabels } from "../../utils/labels";
import { isOvernightShift, getCompanyWorkingIsoDays } from "../../utils/operation-shift-payload";
import { ServiceSearchAutocomplete } from "../services/ServiceSearchAutocomplete";
import { OperationTimeInput } from "../../pages/settings/components/OperationTimeInput";
import { OperationShiftsPanel } from "./OperationShiftsPanel";
import type { ScheduleMode } from "../../types/operation-shift";

const ISO_DAY_OPTIONS = [
  { value: 1, label: "Lun" },
  { value: 2, label: "Mar" },
  { value: 3, label: "Mié" },
  { value: 4, label: "Jue" },
  { value: 5, label: "Vie" },
  { value: 6, label: "Sáb" },
  { value: 7, label: "Dom" },
] as const;

function ShiftOvernightBadgeField({
  control,
  index,
}: {
  control: import("react-hook-form").Control<OperationFormValues>;
  index: number;
}) {
  const startTime = useWatch({ control, name: `shifts.${index}.startTime` });
  const endTime = useWatch({ control, name: `shifts.${index}.endTime` });
  return <ShiftOvernightBadge startTime={startTime} endTime={endTime} />;
}

function ShiftOvernightBadge({ startTime, endTime }: { startTime?: string; endTime?: string }) {
  if (!isOvernightShift(startTime, endTime)) {
    return null;
  }
  return (
    <Badge color="brand" variant="light" w="fit-content">
      Turno nocturno (cruza medianoche)
    </Badge>
  );
}

export const OPERATION_DETAIL_FORM_ID = "operation-detail-form";

interface OperationFormProps {
  mode: "create" | "edit";
  defaultValues: OperationFormValues;
  currentStatus?: OperationStatus;
  currentOperationKind?: OperationKind;
  companyWorkSchedule?: CompanyWorkSchedule | null;
  companyWorkScheduleLoading?: boolean;
  submitLabel: string;
  cancelTo: string;
  onCancel?: () => void;
  loading?: boolean;
  errorMessage?: string | null;
  /** Reports dirty state to the page-level unsaved controller (dedicated edit routes). */
  onDirtyChange?: (dirty: boolean) => void;
  onSubmit: (values: OperationFormValues) => Promise<void>;
  embedded?: boolean;
  formId?: string;
  hideActions?: boolean;
  /** Existing operation identity enables multi-shift management inside the edit form. */
  operationId?: string;
  currentScheduleMode?: ScheduleMode;
  canManageShifts?: boolean;
  onShiftFeedback?: (message: string, severity: "success" | "error") => void;
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
  companyWorkScheduleLoading = false,
  submitLabel,
  cancelTo,
  onCancel,
  loading = false,
  errorMessage,
  onDirtyChange,
  onSubmit,
  embedded = false,
  formId,
  hideActions = false,
  operationId,
  currentScheduleMode,
  canManageShifts = false,
  onShiftFeedback,
}: OperationFormProps) {
  const validationSchema = useMemo(
    () => (mode === "create" ? createOperationFormSchema : operationFormSchema),
    [mode],
  );

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { isDirty, errors },
  } = useForm<OperationFormValues>({
    resolver: zodResolver(validationSchema),
    defaultValues,
  });

  const { fields: shiftFields, append, remove } = useFieldArray({
    control,
    name: "shifts",
  });

  const templatesQuery = useShiftTemplates({ activeOnly: true }, mode === "create");
  const [scheduleEditorOpen, setScheduleEditorOpen] = useState(false);
  const [customScheduleDraft, setCustomScheduleDraft] = useState<WeeklyScheduleDay[] | null>(
    null,
  );
  const activeTemplates = templatesQuery.data ?? [];
  const templateOptions = activeTemplates.map((template) => ({
    value: template.id,
    label: `${template.name} (${template.code})`,
  }));

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    return () => {
      onDirtyChange?.(false);
    };
  }, [onDirtyChange]);

  const operationKind = useWatch({ control, name: "operationKind" });
  const scheduleSource = useWatch({ control, name: "scheduleSource" });
  const scheduleMode = useWatch({ control, name: "scheduleMode" });
  const scheduleDays = useWatch({ control, name: "scheduleDays" });
  const earlyToleranceSource = useWatch({ control, name: "earlyToleranceSource" });
  const lateToleranceSource = useWatch({ control, name: "lateToleranceSource" });
  const lockedKind = mode === "edit" ? (currentOperationKind ?? operationKind) : operationKind;
  const serviceFieldDisabled = mode === "edit" && !isOperationEditable(currentStatus);
  const companyScheduleAvailable = Boolean(companyWorkSchedule);
  const companySourceDisabled =
    serviceFieldDisabled || companyWorkScheduleLoading || !companyScheduleAvailable;
  const isMultiCreate = mode === "create" && scheduleMode === "MULTI_SHIFT";
  const companyWorkingIsoDays = useMemo(
    () => getCompanyWorkingIsoDays(companyWorkSchedule),
    [companyWorkSchedule],
  );
  const defaultShiftEnabledDays =
    lockedKind === "RECURRING" ? companyWorkingIsoDays : undefined;

  useEffect(() => {
    if (
      mode === "create" &&
      lockedKind === "RECURRING" &&
      scheduleSource === "COMPANY" &&
      !companyWorkScheduleLoading &&
      !companyScheduleAvailable
    ) {
      setValue("scheduleSource", "CUSTOM");
    }
  }, [
    companyScheduleAvailable,
    companyWorkScheduleLoading,
    lockedKind,
    mode,
    scheduleSource,
    setValue,
  ]);

  const handleFormSubmit = handleSubmit(async (values) => {
    const effectiveValues =
      values.scheduleMode === "MULTI_SHIFT" && values.operationKind === "RECURRING"
        ? { ...values, scheduleSource: "COMPANY" as const }
        : values;

    if (
      effectiveValues.operationKind === "RECURRING" &&
      effectiveValues.scheduleSource === "COMPANY" &&
      !companyScheduleAvailable &&
      effectiveValues.scheduleMode !== "MULTI_SHIFT"
    ) {
      return;
    }

    const payload =
      effectiveValues.operationKind === "RECURRING" &&
      effectiveValues.scheduleSource === "COMPANY"
        ? { ...effectiveValues, scheduleDays: defaultValues.scheduleDays }
        : effectiveValues;

    await onSubmit(payload);
  });

  // Parents often pass a fresh defaultValues object each render (e.g. buildOperationEditDefaultValues).
  // Reset only when the server-backed values actually change — otherwise edits (dates, etc.) snap back.
  const defaultValuesSnapshot = JSON.stringify(defaultValues);
  useEffect(() => {
    reset(defaultValues);
    // defaultValues is read from the render that produced defaultValuesSnapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity alone must not reset the form
  }, [defaultValuesSnapshot, reset]);

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

  const minScheduledStart = mode === "create" ? getCurrentDatetimeLocal() : undefined;
  const showShiftManagement =
    mode === "edit" &&
    currentScheduleMode === "MULTI_SHIFT" &&
    Boolean(operationId) &&
    Boolean(onShiftFeedback);

  const openCustomScheduleEditor = () => {
    setCustomScheduleDraft(scheduleDays as WeeklyScheduleDay[]);
    setScheduleEditorOpen(true);
  };

  const useCompanySchedule = () => {
    setValue("scheduleSource", "COMPANY", { shouldDirty: true, shouldValidate: true });
    setValue("scheduleDays", defaultValues.scheduleDays);
    setScheduleEditorOpen(false);
  };

  const saveCustomSchedule = () => {
    setValue("scheduleSource", "CUSTOM", { shouldDirty: true, shouldValidate: true });
    setValue("scheduleDays", customScheduleDraft ?? (scheduleDays as WeeklyScheduleDay[]), {
      shouldDirty: true,
      shouldValidate: true,
    });
    setScheduleEditorOpen(false);
  };

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

      {mode === "create" ? (
        <Stack gap="xs">
          <Text size="sm" fw={500}>
            Modo de horario
          </Text>
          <FormGrid>
            <Controller
              name="scheduleMode"
              control={control}
              render={({ field }) => (
                <>
                  <FormGrid.Full>
                    <OperationKindCard
                      selected={field.value === "SINGLE"}
                      title="Horario único"
                      description="Un solo horario para toda la operación (comportamiento habitual)."
                      onClick={() => {
                        field.onChange("SINGLE");
                        setValue("shifts", [], { shouldDirty: true, shouldValidate: true });
                      }}
                    />
                  </FormGrid.Full>
                  <FormGrid.Full>
                    <OperationKindCard
                      selected={field.value === "MULTI_SHIFT"}
                      title="Múltiples turnos"
                      description="La operación se crea con varios turnos (mañana, tarde, noche, etc.)."
                      onClick={() => {
                        field.onChange("MULTI_SHIFT");
                        if (lockedKind === "RECURRING") {
                          setValue("scheduleSource", "COMPANY", {
                            shouldDirty: true,
                            shouldValidate: true,
                          });
                          setValue("scheduleDays", defaultValues.scheduleDays);
                        }
                      }}
                    />
                  </FormGrid.Full>
                </>
              )}
            />
          </FormGrid>
        </Stack>
      ) : null}

      {isMultiCreate ? (
        <Stack gap="sm">
          <Group justify="space-between" align="center">
            <Text size="sm" fw={500}>
              Turnos iniciales
            </Text>
            <Group gap="xs">
              <Select
                placeholder="Desde plantilla"
                data={templateOptions}
                searchable
                clearable
                disabled={templateOptions.length === 0}
                value={null}
                onChange={(templateId) => {
                  const template = activeTemplates.find((item) => item.id === templateId);
                  if (!template) {
                    return;
                  }
                  append({
                    code: template.code,
                    name: template.name,
                    templateId: template.id,
                    startTime: template.startTime,
                    endTime: template.endTime,
                    enabledDays: defaultShiftEnabledDays,
                  });
                }}
                w={220}
              />
              <Button
                size="xs"
                variant="light"
                onClick={() =>
                  append({
                    code: "",
                    name: "",
                    startTime: "08:00",
                    endTime: "16:00",
                    enabledDays: defaultShiftEnabledDays,
                  })
                }
              >
                Turno personalizado
              </Button>
            </Group>
          </Group>
          {errors.shifts?.message || errors.shifts?.root?.message ? (
            <Text size="xs" c="red">
              {errors.shifts?.message ?? errors.shifts?.root?.message}
            </Text>
          ) : null}
          {shiftFields.length === 0 ? (
            <Text size="sm" c="dimmed">
              Agregá al menos un turno desde plantilla o personalizado.
            </Text>
          ) : (
            <Stack gap="sm">
              {shiftFields.map((field, index) => (
                <Paper key={field.id} withBorder p="sm">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Text size="sm" fw={600}>
                        Turno {index + 1}
                      </Text>
                      <Button
                        size="compact-xs"
                        color="red"
                        variant="light"
                        onClick={() => remove(index)}
                      >
                        Quitar
                      </Button>
                    </Group>
                    <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                      <Controller
                        name={`shifts.${index}.code`}
                        control={control}
                        render={({ field: codeField, fieldState }) => (
                          <TextInput
                            label="Código"
                            value={codeField.value}
                            onChange={(event) => codeField.onChange(event.currentTarget.value)}
                            error={fieldState.error?.message}
                            required
                          />
                        )}
                      />
                      <Controller
                        name={`shifts.${index}.name`}
                        control={control}
                        render={({ field: nameField, fieldState }) => (
                          <TextInput
                            label="Nombre"
                            value={nameField.value}
                            onChange={(event) => nameField.onChange(event.currentTarget.value)}
                            error={fieldState.error?.message}
                            required
                          />
                        )}
                      />
                      <Controller
                        name={`shifts.${index}.startTime`}
                        control={control}
                        render={({ field: startField }) => (
                          <Stack gap={4}>
                            <Text size="sm" fw={500}>
                              Inicio
                            </Text>
                            <OperationTimeInput
                              value={startField.value}
                              onChange={startField.onChange}
                              aria-label={`Inicio turno ${index + 1}`}
                            />
                          </Stack>
                        )}
                      />
                      <Controller
                        name={`shifts.${index}.endTime`}
                        control={control}
                        render={({ field: endField }) => (
                          <Stack gap={4}>
                            <Text size="sm" fw={500}>
                              Fin
                            </Text>
                            <OperationTimeInput
                              value={endField.value}
                              onChange={endField.onChange}
                              aria-label={`Fin turno ${index + 1}`}
                            />
                          </Stack>
                        )}
                      />
                    </SimpleGrid>
                    <ShiftOvernightBadgeField control={control} index={index} />
                    {lockedKind === "RECURRING" ? (
                      <Controller
                        name={`shifts.${index}.enabledDays`}
                        control={control}
                        render={({ field: daysField, fieldState }) => (
                          <Stack gap={6}>
                            <Text size="sm" fw={500}>
                              Días
                            </Text>
                            <Text size="xs" c="dimmed">
                              Inicializados con los días laborables de la empresa. Podés ajustarlos
                              por turno.
                            </Text>
                            <Group gap="xs">
                              {ISO_DAY_OPTIONS.map((day) => {
                                const checked = (daysField.value ?? []).includes(day.value);
                                return (
                                  <Checkbox
                                    key={day.value}
                                    label={day.label}
                                    checked={checked}
                                    onChange={(event) => {
                                      const next = new Set(daysField.value ?? []);
                                      if (event.currentTarget.checked) {
                                        next.add(day.value);
                                      } else {
                                        next.delete(day.value);
                                      }
                                      daysField.onChange([...next].sort((a, b) => a - b));
                                    }}
                                  />
                                );
                              })}
                            </Group>
                            {fieldState.error ? (
                              <Text size="xs" c="red">
                                {fieldState.error.message}
                              </Text>
                            ) : null}
                          </Stack>
                        )}
                      />
                    ) : null}
                  </Stack>
                </Paper>
              ))}
            </Stack>
          )}
        </Stack>
      ) : null}

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
                  onChange={(event) => field.onChange(event.currentTarget.value)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
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
                  description="Vacío = sin fecha de finalización"
                  inputWrapperOrder={["label", "input", "description", "error"]}
                  value={field.value ?? ""}
                  onChange={(event) => field.onChange(event.currentTarget.value)}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                  error={fieldState.error?.message}
                  disabled={serviceFieldDisabled}
                />
              )}
            />
          </FormGrid>

          {isMultiCreate ? (
            <Text size="sm" c="dimmed">
              En multi-turno, cada turno define su propio horario.
            </Text>
          ) : (
            <Group justify="space-between" align="center">
              <Stack gap={2}>
                <Text size="sm" fw={500}>
                  Horario
                </Text>
                <Text size="sm" c="dimmed">
                  {scheduleSource === "CUSTOM" ? "Horario específico" : "Horario de la empresa"}
                </Text>
              </Stack>
              <Button
                type="button"
                variant="light"
                onClick={openCustomScheduleEditor}
                disabled={serviceFieldDisabled}
              >
                {scheduleSource === "CUSTOM"
                  ? "Editar horario específico"
                  : "Configurar horario específico"}
              </Button>
            </Group>
          )}
        </Stack>
      )}

      {lockedKind === "RECURRING" && !isMultiCreate ? (
        <ResponsiveModal
          opened={scheduleEditorOpen}
          onClose={() => setScheduleEditorOpen(false)}
          title="Horario específico"
          size="lg"
          footer={
            <Group justify="space-between" gap="sm">
              <Button
                type="button"
                variant="default"
                onClick={useCompanySchedule}
                disabled={companySourceDisabled}
              >
                Usar horario de la empresa
              </Button>
              <Group gap="sm">
                <Button type="button" variant="default" onClick={() => setScheduleEditorOpen(false)}>
                  Cancelar
                </Button>
                <Button type="button" onClick={saveCustomSchedule} disabled={serviceFieldDisabled}>
                  Guardar horario específico
                </Button>
              </Group>
            </Group>
          }
        >
          <Stack gap="sm">
            <Text size="sm" c="dimmed">
              Configurá el horario semanal solo cuando esta operación no deba usar el horario de la
              empresa.
            </Text>
            <WeeklyScheduleEditor
              value={customScheduleDraft ?? (scheduleDays as WeeklyScheduleDay[])}
              onChange={setCustomScheduleDraft}
              disabled={serviceFieldDisabled}
              readOnly={mode === "edit" && serviceFieldDisabled}
            />
          </Stack>
        </ResponsiveModal>
      ) : null}

      <FormGrid>
        <Stack gap="xs">
          <Switch
            label="Personalizar tolerancia de llegada temprana"
            description="Desactivado: hereda el valor actual de la empresa."
            checked={earlyToleranceSource === "CUSTOM"}
            onChange={(event) =>
              setValue(
                "earlyToleranceSource",
                event.currentTarget.checked ? "CUSTOM" : "COMPANY_DEFAULT",
                { shouldDirty: true, shouldValidate: true },
              )
            }
            disabled={serviceFieldDisabled}
          />
          <RHFNumberInput
            control={control}
            name="earlyToleranceMinutes"
            label="Tolerancia temprana (minutos)"
            required={earlyToleranceSource === "CUSTOM"}
            min={0}
            step={1}
            disabled={serviceFieldDisabled || earlyToleranceSource !== "CUSTOM"}
          />
        </Stack>
        <Stack gap="xs">
          <Switch
            label="Personalizar tolerancia de llegada tardía"
            description="Desactivado: hereda el valor actual de la empresa."
            checked={lateToleranceSource === "CUSTOM"}
            onChange={(event) =>
              setValue(
                "lateToleranceSource",
                event.currentTarget.checked ? "CUSTOM" : "COMPANY_DEFAULT",
                { shouldDirty: true, shouldValidate: true },
              )
            }
            disabled={serviceFieldDisabled}
          />
          <RHFNumberInput
            control={control}
            name="lateToleranceMinutes"
            label="Tolerancia tardía (minutos)"
            required={lateToleranceSource === "CUSTOM"}
            min={0}
            step={1}
            disabled={serviceFieldDisabled || lateToleranceSource !== "CUSTOM"}
          />
        </Stack>
      </FormGrid>

      {mode === "edit" && statusOptions.length > 0 ? (
        <FormGrid>
          <FormGrid.Full>
            <RHFSelect control={control} name="status" label="Estado" data={statusOptions} />
          </FormGrid.Full>
        </FormGrid>
      ) : null}

      {showShiftManagement && operationId && onShiftFeedback ? (
        <OperationShiftsPanel
          operationId={operationId}
          scheduleMode="MULTI_SHIFT"
          canManage={canManageShifts}
          onFeedback={onShiftFeedback}
        />
      ) : null}

      {!hideActions ? (
        <FormActions submitLabel={submitLabel} cancelTo={cancelTo} onCancel={onCancel} loading={loading} />
      ) : null}
    </Stack>
  );

  return (
    <form id={formId} onSubmit={handleFormSubmit} noValidate>
      {embedded ? formContent : <FormSection>{formContent}</FormSection>}
    </form>
  );
}
