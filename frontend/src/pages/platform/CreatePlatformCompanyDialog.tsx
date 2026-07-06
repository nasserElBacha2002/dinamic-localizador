import {
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { DEFAULT_COMPANY_OPERATIONAL_DEFAULTS } from "../../constants/company-operational-defaults";
import {
  DEFAULT_OPERATION_TIMEZONE,
  getCanonicalOperationTimezone,
  getOperationTimezoneOptions,
} from "../../constants/operation-timezones";
import { FormGrid } from "../../design-system";
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
  validateCompanySettingsForm,
} from "../../utils/company-settings-validation";
import { OperationTimeInput } from "../settings/components/OperationTimeInput";
import { SettingsFormField } from "../settings/components/SettingsFormField";

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
  onSubmit: (input: CreatePlatformCompanyInput) => void;
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

  const timezoneOptions = useMemo(
    () => getOperationTimezoneOptions(settings.operationTimezone),
    [settings.operationTimezone],
  );
  const selectedTimezone = getCanonicalOperationTimezone(settings.operationTimezone);

  const resetForm = () => {
    setName(DEFAULT_FORM_STATE.name);
    setSettings({ ...DEFAULT_SETTINGS });
    setModules([...DEFAULT_FORM_STATE.modules!]);
    setOwnerName(DEFAULT_FORM_STATE.ownerName);
    setOwnerEmail(DEFAULT_FORM_STATE.ownerEmail);
    setOwnerTemporaryPassword(DEFAULT_FORM_STATE.ownerTemporaryPassword);
  };

  const validationErrors = useMemo(() => {
    const errors: string[] = [];

    if (!name.trim()) {
      errors.push("El nombre de la empresa es obligatorio.");
    }

    errors.push(...validateCompanySettingsForm(settings));

    if (!ownerName.trim()) {
      errors.push("El nombre del owner es obligatorio.");
    }
    if (!ownerEmail.trim()) {
      errors.push("El email del owner es obligatorio.");
    }
    if (!ownerTemporaryPassword || ownerTemporaryPassword.length < 8) {
      errors.push("La contraseña temporal del owner debe tener al menos 8 caracteres.");
    }
    if (!modules || modules.length === 0) {
      errors.push("Debe habilitar al menos un módulo.");
    }

    return errors;
  }, [modules, name, ownerEmail, ownerName, ownerTemporaryPassword, settings]);

  const isValid = validationErrors.length === 0;

  const handleSubmit = () => {
    if (!isValid || loading) return;

    const settingsPayload = toCompanySettingsUpdateInput(settings);

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
    });
  };

  const handleClose = () => {
    if (loading) return;
    resetForm();
    onClose();
  };

  const updateSettings = (patch: Partial<CompanySettingsFormValues>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  return (
    <Modal
      opened={open}
      onClose={loading ? () => undefined : handleClose}
      title="Crear empresa"
      size="xl"
      centered
      onExitTransitionEnd={() => {
        if (!open) resetForm();
      }}
    >
      <Stack gap="md">
        <Stack gap="sm">
          <Text fw={600}>Configuración operativa</Text>
          <Text size="sm" c="dimmed">
            Defaults usados por operaciones, importaciones y validaciones del bot.
          </Text>

          <TextInput
            label="Nombre de la empresa"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
            required
          />

          <FormGrid columns={{ base: 1, md: 2 }}>
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
                disabled={loading}
                aria-label="Zona horaria operativa"
              />
            </SettingsFormField>

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
                disabled={loading}
              />
            </SettingsFormField>

            <SettingsFormField
              label="Horario de inicio por defecto"
              description="Default para operaciones e importaciones."
            >
              <OperationTimeInput
                value={settings.defaultOperationStartTime}
                onChange={(value) => updateSettings({ defaultOperationStartTime: value })}
                disabled={loading}
                aria-label="Horario de inicio por defecto"
              />
            </SettingsFormField>

            <SettingsFormField
              label="Horario de fin por defecto"
              description="Default para operaciones e importaciones."
            >
              <OperationTimeInput
                value={settings.defaultOperationEndTime}
                onChange={(value) => updateSettings({ defaultOperationEndTime: value })}
                disabled={loading}
                aria-label="Horario de fin por defecto"
              />
            </SettingsFormField>

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
                disabled={loading}
              />
            </SettingsFormField>

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
                disabled={loading}
              />
            </SettingsFormField>

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
                disabled={loading}
              />
            </SettingsFormField>

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
                disabled={loading}
              />
            </SettingsFormField>
          </FormGrid>

          <Switch
            label="Requerir ubicación en checkout"
            description="Si está activo, el empleado deberá compartir ubicación al enviar “Terminé”."
            checked={settings.requireCheckoutLocation}
            onChange={(event) => {
              updateSettings({ requireCheckoutLocation: event.currentTarget.checked });
            }}
            disabled={loading}
          />
          <Switch
            label="Permitir correcciones manuales de asistencia"
            description="Habilita ajustes manuales de asistencia desde el panel operativo."
            checked={settings.allowManualAttendanceCorrections}
            onChange={(event) => {
              updateSettings({ allowManualAttendanceCorrections: event.currentTarget.checked });
            }}
            disabled={loading}
          />
        </Stack>

        <Divider />

        <Stack gap="sm">
          <Text fw={600}>Accesos</Text>
          <Text size="sm" c="dimmed">
            Módulos habilitados para la empresa y usuario owner inicial.
          </Text>

          <Stack gap="xs">
            {MODULE_OPTIONS.map((moduleKey) => (
              <Checkbox
                key={moduleKey}
                label={COMPANY_MODULE_LABELS[moduleKey]}
                description={COMPANY_MODULE_DESCRIPTIONS[moduleKey]}
                checked={modules?.includes(moduleKey) ?? false}
                onChange={(event) => {
                  const checked = event.currentTarget.checked;
                  setModules((current) => {
                    const next = new Set(current ?? []);
                    if (checked) next.add(moduleKey);
                    else next.delete(moduleKey);
                    return [...next];
                  });
                }}
                disabled={loading}
              />
            ))}
          </Stack>

          <TextInput
            label="Nombre del owner"
            value={ownerName}
            onChange={(event) => setOwnerName(event.currentTarget.value)}
            required
          />
          <TextInput
            label="Email del owner"
            type="email"
            value={ownerEmail}
            onChange={(event) => setOwnerEmail(event.currentTarget.value)}
            required
          />
          <TextInput
            label="Contraseña temporal del owner"
            type="password"
            value={ownerTemporaryPassword}
            onChange={(event) => setOwnerTemporaryPassword(event.currentTarget.value)}
            required
            description="La contraseña se usará solo si el usuario owner no existe todavía. Si el usuario ya existe, el backend no cambiará su contraseña."
          />
        </Stack>

        {validationErrors.length > 0 ? (
          <Text size="sm" c="red">
            {validationErrors.join(" ")}
          </Text>
        ) : null}
        {errorMessage ? (
          <Text size="sm" c="red">
            {errorMessage}
          </Text>
        ) : null}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={loading || !isValid} loading={loading}>
            Crear empresa
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
