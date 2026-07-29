import {
  Alert,
  Button,
  Checkbox,
  Divider,
  Group,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_COMPANY_OPERATIONAL_DEFAULTS } from "../../constants/company-operational-defaults";
import {
  DEFAULT_OPERATION_TIMEZONE,
  getCanonicalOperationTimezone,
  getOperationTimezoneOptions,
} from "../../constants/operation-timezones";
import { FormGrid, ResponsiveModal } from "../../design-system";
import type { CompanyModuleKey } from "../../types/company-module";
import type { CreatePlatformCompanyInput } from "../../types/platform-company";
import type { CompanySettingsFormValues } from "../../types/company-settings";
import {
  COMPANY_MODULE_DESCRIPTIONS,
  COMPANY_MODULE_LABELS,
} from "../../utils/company-modules";
import {
  toCompanySettingsFormValues,
  toCompanySettingsUpdateInput,
} from "../../utils/company-settings-validation";
import { OperationTimeInput } from "../settings/components/OperationTimeInput";
import { SettingsFormField } from "../settings/components/SettingsFormField";
import {
  countCreateCompanyFieldErrors,
  getFirstCreatePlatformCompanyErrorField,
  isCreateCompanyValidationValid,
  validateCreatePlatformCompanyForm,
  type CreateCompanyVisibleFieldKey,
} from "./create-platform-company-form";

const MODULE_OPTIONS: CompanyModuleKey[] = [
  "attendance",
  "operations",
  "absences",
  "reports",
  "bot_simulator",
];

const numberInputProps = {
  min: 0,
  max: 240,
  step: 1,
  hideControls: true,
} as const;

const DEFAULT_SETTINGS = toCompanySettingsFormValues(DEFAULT_COMPANY_OPERATIONAL_DEFAULTS);

const DEFAULT_FORM_STATE = {
  name: "",
  settings: DEFAULT_SETTINGS,
  modules: [...MODULE_OPTIONS] as CreatePlatformCompanyInput["modules"],
  ownerName: "",
  ownerEmail: "",
  ownerTemporaryPassword: "",
};

interface CreatePlatformCompanyDialogProps {
  open: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (input: CreatePlatformCompanyInput) => void | Promise<void>;
}

function focusFieldWithinRoot(
  root: HTMLElement | null,
  field: CreateCompanyVisibleFieldKey,
): void {
  if (!root) return;
  const wrapper = root.querySelector(`[data-create-company-field="${field}"]`);
  if (!(wrapper instanceof HTMLElement)) return;
  wrapper.scrollIntoView({ block: "center", behavior: "smooth" });
  const focusable = wrapper.querySelector<HTMLElement>(
    "input:not([type='hidden']), textarea, select, button, [tabindex]:not([tabindex='-1'])",
  );
  focusable?.focus();
}

export function CreatePlatformCompanyDialog({
  open,
  loading = false,
  errorMessage,
  onClose,
  onSubmit,
}: CreatePlatformCompanyDialogProps) {
  const [name, setName] = useState(DEFAULT_FORM_STATE.name);
  const [settings, setSettings] = useState<CompanySettingsFormValues>(DEFAULT_FORM_STATE.settings);
  const [modules, setModules] = useState<CreatePlatformCompanyInput["modules"]>(
    DEFAULT_FORM_STATE.modules,
  );
  const [ownerName, setOwnerName] = useState(DEFAULT_FORM_STATE.ownerName);
  const [ownerEmail, setOwnerEmail] = useState(DEFAULT_FORM_STATE.ownerEmail);
  const [ownerTemporaryPassword, setOwnerTemporaryPassword] = useState(
    DEFAULT_FORM_STATE.ownerTemporaryPassword,
  );
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [localSubmitting, setLocalSubmitting] = useState(false);
  const [focusRequest, setFocusRequest] = useState<CreateCompanyVisibleFieldKey | null>(null);

  const formRootRef = useRef<HTMLDivElement | null>(null);
  const submitLockRef = useRef(false);

  const busy = loading || localSubmitting;

  const timezoneOptions = useMemo(
    () => getOperationTimezoneOptions(settings.operationTimezone),
    [settings.operationTimezone],
  );
  const selectedTimezone = getCanonicalOperationTimezone(settings.operationTimezone);

  const formState = useMemo(
    () => ({
      name,
      settings,
      modules: modules ?? [],
      ownerName,
      ownerEmail,
      ownerTemporaryPassword,
    }),
    [name, settings, modules, ownerName, ownerEmail, ownerTemporaryPassword],
  );

  const validation = useMemo(
    () =>
      submitAttempted
        ? validateCreatePlatformCompanyForm(formState)
        : { fieldErrors: {}, formErrors: [] as string[] },
    [formState, submitAttempted],
  );

  const visibleErrors = validation.fieldErrors;
  const fieldErrorCount = countCreateCompanyFieldErrors(validation);
  const firstInvalidField = getFirstCreatePlatformCompanyErrorField(validation);
  const firstFieldErrorMessage = firstInvalidField
    ? visibleErrors[firstInvalidField]
    : undefined;

  useEffect(() => {
    if (!focusRequest) return;
    const frame = window.requestAnimationFrame(() => {
      focusFieldWithinRoot(formRootRef.current, focusRequest);
      setFocusRequest(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusRequest]);

  const resetForm = () => {
    setName(DEFAULT_FORM_STATE.name);
    setSettings({ ...DEFAULT_SETTINGS });
    setModules([...DEFAULT_FORM_STATE.modules!]);
    setOwnerName(DEFAULT_FORM_STATE.ownerName);
    setOwnerEmail(DEFAULT_FORM_STATE.ownerEmail);
    setOwnerTemporaryPassword(DEFAULT_FORM_STATE.ownerTemporaryPassword);
    setSubmitAttempted(false);
    setLocalSubmitting(false);
    setFocusRequest(null);
    submitLockRef.current = false;
  };

  const handleSubmit = async () => {
    if (busy || submitLockRef.current) return;

    const nextValidation = validateCreatePlatformCompanyForm(formState);
    setSubmitAttempted(true);

    if (!isCreateCompanyValidationValid(nextValidation)) {
      const firstInvalid = getFirstCreatePlatformCompanyErrorField(nextValidation);
      if (firstInvalid) {
        setFocusRequest(firstInvalid);
      }
      return;
    }

    submitLockRef.current = true;
    setLocalSubmitting(true);

    const settingsPayload = toCompanySettingsUpdateInput(settings);

    try {
      await Promise.resolve(
        onSubmit({
          name: name.trim(),
          defaultTimezone: settingsPayload.operationTimezone || DEFAULT_OPERATION_TIMEZONE,
          settings: settingsPayload,
          modules,
          owner: {
            name: ownerName.trim(),
            email: ownerEmail.trim(),
            temporaryPassword: ownerTemporaryPassword,
          },
        }),
      );
    } finally {
      submitLockRef.current = false;
      setLocalSubmitting(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    resetForm();
    onClose();
  };

  const updateSettings = (patch: Partial<CompanySettingsFormValues>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const fieldAnchor = (key: CreateCompanyVisibleFieldKey) => ({
    "data-create-company-field": key,
  });

  const compactBanner =
    submitAttempted && (fieldErrorCount > 0 || validation.formErrors.length > 0) ? (
      <Alert color="red" title="Revisá los datos del formulario" role="alert">
        <Stack gap={6}>
          {fieldErrorCount > 0 ? (
            <Text size="sm">
              Hay {fieldErrorCount}{" "}
              {fieldErrorCount === 1 ? "campo para revisar" : "campos para revisar"}.
            </Text>
          ) : null}
          {firstFieldErrorMessage ? (
            <Text size="sm">{firstFieldErrorMessage}</Text>
          ) : null}
          {validation.formErrors.map((message, index) => (
            <Text key={`form-error-${index}`} size="sm">
              {message}
            </Text>
          ))}
          {firstInvalidField ? (
            <Button
              variant="subtle"
              size="compact-sm"
              onClick={() => setFocusRequest(firstInvalidField)}
              disabled={busy}
            >
              Ir al primer error
            </Button>
          ) : null}
        </Stack>
      </Alert>
    ) : null;

  return (
    <ResponsiveModal
      opened={open}
      onClose={busy ? () => undefined : handleClose}
      title="Crear empresa"
      size="xl"
      bodyMode="scroll"
      onExitTransitionEnd={() => {
        if (!open) resetForm();
      }}
      footerBanner={
        compactBanner || errorMessage ? (
          <Stack gap="xs">
            {compactBanner}
            {errorMessage ? (
              <Alert color="red" title="No se pudo crear la empresa" role="alert">
                {errorMessage}
              </Alert>
            ) : null}
          </Stack>
        ) : null
      }
      footer={
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={handleClose} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={busy} loading={busy}>
            Crear empresa
          </Button>
        </Group>
      }
    >
      <Stack gap="md" ref={formRootRef}>
        <Stack gap="sm">
          <Text fw={600}>Configuración operativa</Text>
          <Text size="sm" c="dimmed">
            Defaults usados por operaciones, importaciones y validaciones del bot.
          </Text>

          <div {...fieldAnchor("name")}>
            <TextInput
              label="Nombre de la empresa"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
              required
              error={visibleErrors.name}
              aria-invalid={Boolean(visibleErrors.name)}
              disabled={busy}
            />
          </div>

          <FormGrid columns={{ base: 1, md: 2 }}>
            <div {...fieldAnchor("operationTimezone")}>
              <SettingsFormField
                label="Zona horaria operativa"
                description="Zona horaria usada por operaciones y reportes."
              >
                <Select
                  searchable
                  data={timezoneOptions}
                  value={selectedTimezone}
                  onChange={(value) => {
                    if (!value) return;
                    updateSettings({ operationTimezone: value });
                  }}
                  nothingFoundMessage="No se encontraron zonas horarias"
                  disabled={busy}
                  aria-label="Zona horaria operativa"
                  error={visibleErrors.operationTimezone}
                  aria-invalid={Boolean(visibleErrors.operationTimezone)}
                />
              </SettingsFormField>
            </div>

            <div {...fieldAnchor("defaultRadiusMeters")}>
              <SettingsFormField
                label="Radio permitido por defecto (m)"
                description="Default para operaciones e importaciones."
              >
                <NumberInput
                  value={settings.defaultRadiusMeters === "" ? "" : Number(settings.defaultRadiusMeters)}
                  onChange={(value) =>
                    updateSettings({
                      defaultRadiusMeters: value === "" || value === undefined ? "" : String(value),
                    })
                  }
                  min={10}
                  max={5000}
                  step={1}
                  hideControls
                  disabled={busy}
                  error={visibleErrors.defaultRadiusMeters}
                  aria-label="Radio permitido por defecto"
                  aria-invalid={Boolean(visibleErrors.defaultRadiusMeters)}
                />
              </SettingsFormField>
            </div>

            <div {...fieldAnchor("defaultOperationStartTime")}>
              <SettingsFormField
                label="Horario de inicio por defecto"
                description="Default para operaciones e importaciones. Puede ser mayor que el fin si la jornada atraviesa medianoche."
              >
                <OperationTimeInput
                  value={settings.defaultOperationStartTime}
                  onChange={(value) => updateSettings({ defaultOperationStartTime: value })}
                  disabled={busy}
                  aria-label="Horario de inicio por defecto"
                  error={visibleErrors.defaultOperationStartTime}
                  aria-invalid={Boolean(visibleErrors.defaultOperationStartTime)}
                />
              </SettingsFormField>
            </div>

            <div {...fieldAnchor("defaultOperationEndTime")}>
              <SettingsFormField
                label="Horario de fin por defecto"
                description="Acepta jornadas nocturnas (por ejemplo 20:30 a 03:00)."
              >
                <OperationTimeInput
                  value={settings.defaultOperationEndTime}
                  onChange={(value) => updateSettings({ defaultOperationEndTime: value })}
                  disabled={busy}
                  aria-label="Horario de fin por defecto"
                  error={visibleErrors.defaultOperationEndTime}
                  aria-invalid={Boolean(visibleErrors.defaultOperationEndTime)}
                />
              </SettingsFormField>
            </div>

            <div {...fieldAnchor("defaultEarlyArrivalToleranceMinutes")}>
              <SettingsFormField
                label="Tolerancia de llegada temprana para operaciones (min)"
                description="Default para operaciones e importaciones."
              >
                <NumberInput
                  value={
                    settings.defaultEarlyArrivalToleranceMinutes === ""
                      ? ""
                      : Number(settings.defaultEarlyArrivalToleranceMinutes)
                  }
                  onChange={(value) =>
                    updateSettings({
                      defaultEarlyArrivalToleranceMinutes:
                        value === "" || value === undefined ? "" : String(value),
                    })
                  }
                  {...numberInputProps}
                  disabled={busy}
                  error={visibleErrors.defaultEarlyArrivalToleranceMinutes}
                  aria-label="Tolerancia de llegada temprana para operaciones"
                  aria-invalid={Boolean(visibleErrors.defaultEarlyArrivalToleranceMinutes)}
                />
              </SettingsFormField>
            </div>

            <div {...fieldAnchor("defaultLateArrivalToleranceMinutes")}>
              <SettingsFormField
                label="Tolerancia de llegada tardía para operaciones (min)"
                description="Default para operaciones e importaciones."
              >
                <NumberInput
                  value={
                    settings.defaultLateArrivalToleranceMinutes === ""
                      ? ""
                      : Number(settings.defaultLateArrivalToleranceMinutes)
                  }
                  onChange={(value) =>
                    updateSettings({
                      defaultLateArrivalToleranceMinutes:
                        value === "" || value === undefined ? "" : String(value),
                    })
                  }
                  {...numberInputProps}
                  disabled={busy}
                  error={visibleErrors.defaultLateArrivalToleranceMinutes}
                  aria-label="Tolerancia de llegada tardía para operaciones"
                  aria-invalid={Boolean(visibleErrors.defaultLateArrivalToleranceMinutes)}
                />
              </SettingsFormField>
            </div>

            <div {...fieldAnchor("lateGraceMinutes")}>
              <SettingsFormField
                label="Tolerancia de puntualidad WhatsApp (min)"
                description="Validación del mensaje “Llegué”."
              >
                <NumberInput
                  value={settings.lateGraceMinutes === "" ? "" : Number(settings.lateGraceMinutes)}
                  onChange={(value) =>
                    updateSettings({
                      lateGraceMinutes: value === "" || value === undefined ? "" : String(value),
                    })
                  }
                  {...numberInputProps}
                  disabled={busy}
                  error={visibleErrors.lateGraceMinutes}
                  aria-label="Tolerancia de puntualidad WhatsApp"
                  aria-invalid={Boolean(visibleErrors.lateGraceMinutes)}
                />
              </SettingsFormField>
            </div>

            <div {...fieldAnchor("earlyLeaveToleranceMinutes")}>
              <SettingsFormField
                label="Tolerancia de salida anticipada WhatsApp (min)"
                description="Validación del mensaje “Terminé”."
              >
                <NumberInput
                  value={
                    settings.earlyLeaveToleranceMinutes === ""
                      ? ""
                      : Number(settings.earlyLeaveToleranceMinutes)
                  }
                  onChange={(value) =>
                    updateSettings({
                      earlyLeaveToleranceMinutes:
                        value === "" || value === undefined ? "" : String(value),
                    })
                  }
                  {...numberInputProps}
                  disabled={busy}
                  error={visibleErrors.earlyLeaveToleranceMinutes}
                  aria-label="Tolerancia de salida anticipada WhatsApp"
                  aria-invalid={Boolean(visibleErrors.earlyLeaveToleranceMinutes)}
                />
              </SettingsFormField>
            </div>
          </FormGrid>

          <Switch
            label="Requerir ubicación en checkout"
            description="Si está activo, el empleado deberá compartir ubicación al enviar “Terminé”."
            checked={settings.requireCheckoutLocation}
            onChange={(event) => {
              updateSettings({ requireCheckoutLocation: event.currentTarget.checked });
            }}
            disabled={busy}
          />
          <Switch
            label="Permitir correcciones manuales de asistencia"
            description="Habilita ajustes manuales de asistencia desde el panel operativo."
            checked={settings.allowManualAttendanceCorrections}
            onChange={(event) => {
              updateSettings({ allowManualAttendanceCorrections: event.currentTarget.checked });
            }}
            disabled={busy}
          />
        </Stack>

        <Divider />

        <Stack gap="sm">
          <Text fw={600}>Accesos</Text>
          <Text size="sm" c="dimmed">
            Módulos habilitados para la empresa y usuario owner inicial.
          </Text>

          <div {...fieldAnchor("modules")}>
            <fieldset
              style={{ border: "none", margin: 0, padding: 0 }}
              aria-invalid={Boolean(visibleErrors.modules)}
              aria-describedby={visibleErrors.modules ? "create-company-modules-error" : undefined}
            >
              <legend style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
                Módulos habilitados
              </legend>
              <Stack gap="xs">
                {MODULE_OPTIONS.map((moduleKey) => (
                  <Checkbox
                    key={moduleKey}
                    label={COMPANY_MODULE_LABELS[moduleKey]}
                    description={COMPANY_MODULE_DESCRIPTIONS[moduleKey]}
                    checked={modules?.includes(moduleKey) ?? false}
                    onChange={(event) => {
                      const checked = event.currentTarget.checked;
                      setModules((current) =>
                        setModulesFromToggle(current ?? [], moduleKey, checked),
                      );
                    }}
                    disabled={busy}
                  />
                ))}
                {visibleErrors.modules ? (
                  <Text id="create-company-modules-error" size="sm" c="red">
                    {visibleErrors.modules}
                  </Text>
                ) : null}
              </Stack>
            </fieldset>
          </div>

          <div {...fieldAnchor("ownerName")}>
            <TextInput
              label="Nombre del owner"
              value={ownerName}
              onChange={(event) => setOwnerName(event.currentTarget.value)}
              required
              error={visibleErrors.ownerName}
              aria-invalid={Boolean(visibleErrors.ownerName)}
              disabled={busy}
            />
          </div>
          <div {...fieldAnchor("ownerEmail")}>
            <TextInput
              label="Email del owner"
              type="email"
              value={ownerEmail}
              onChange={(event) => setOwnerEmail(event.currentTarget.value)}
              required
              error={visibleErrors.ownerEmail}
              aria-invalid={Boolean(visibleErrors.ownerEmail)}
              disabled={busy}
            />
          </div>
          <div {...fieldAnchor("ownerTemporaryPassword")}>
            <TextInput
              label="Contraseña temporal del owner"
              type="password"
              value={ownerTemporaryPassword}
              onChange={(event) => setOwnerTemporaryPassword(event.currentTarget.value)}
              required
              error={visibleErrors.ownerTemporaryPassword}
              aria-invalid={Boolean(visibleErrors.ownerTemporaryPassword)}
              disabled={busy}
              description="La contraseña se usará solo si el usuario owner no existe todavía. Si el usuario ya existe, el backend no cambiará su contraseña."
            />
          </div>
        </Stack>
      </Stack>
    </ResponsiveModal>
  );
}

function setModulesFromToggle(
  current: CompanyModuleKey[],
  moduleKey: CompanyModuleKey,
  checked: boolean,
): CompanyModuleKey[] {
  const next = new Set(current);
  if (checked) next.add(moduleKey);
  else next.delete(moduleKey);
  return [...next];
}
