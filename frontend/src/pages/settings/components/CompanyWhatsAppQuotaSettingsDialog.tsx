import {
  Alert,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  Text,
  Title,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { FormGrid } from "../../../design-system";
import { useUpdateWhatsAppQuotaSettings } from "../../../hooks/useWhatsAppQuotaSettings";
import type {
  WhatsAppQuotaFormValues,
  WhatsAppQuotaSettings,
} from "../../../types/whatsapp-quota-settings";
import { getApiErrorMessage } from "../../../utils/errors";
import {
  effectiveModeReasonLabel,
  modeDescription,
  toWhatsAppQuotaFormValues,
  validateWhatsAppQuotaForm,
  whatsappQuotaFormEqual,
} from "../../../utils/whatsapp-quota-settings";
import { SettingsDialog } from "./SettingsDialog";
import { SettingsFormField } from "./SettingsFormField";

const MODE_OPTIONS = [
  { value: "OFF", label: "OFF — desactivado" },
  { value: "SHADOW", label: "SHADOW — medición" },
  { value: "ENFORCE", label: "ENFORCE — aplicar límites" },
];

interface CompanyWhatsAppQuotaSettingsDialogProps {
  opened: boolean;
  onClose: () => void;
  settings: WhatsAppQuotaSettings;
  canUpdate: boolean;
  onSaved: (message: string) => void;
}

export function CompanyWhatsAppQuotaSettingsDialog({
  opened,
  onClose,
  settings,
  canUpdate,
  onSaved,
}: CompanyWhatsAppQuotaSettingsDialogProps) {
  const updateMutation = useUpdateWhatsAppQuotaSettings();
  const baseline = useMemo(() => toWhatsAppQuotaFormValues(settings), [settings]);
  const [formValues, setFormValues] = useState<WhatsAppQuotaFormValues>(baseline);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [enforceConfirmOpen, setEnforceConfirmOpen] = useState(false);

  const validationErrors = useMemo(
    () => validateWhatsAppQuotaForm(formValues, settings.limits),
    [formValues, settings.limits],
  );
  const hasChanges = !whatsappQuotaFormEqual(formValues, baseline);
  const isValid = validationErrors.length === 0;
  const disabled = !canUpdate || updateMutation.isPending;

  const effectiveWillBeEnforce =
    settings.globalMode === "ENFORCE" && formValues.companyMode === "ENFORCE";
  const activatingEnforce =
    formValues.companyMode === "ENFORCE" && baseline.companyMode !== "ENFORCE";

  const discardAndClose = () => {
    setFormValues(baseline);
    setSubmitError(null);
    setEnforceConfirmOpen(false);
    onClose();
  };

  const handleClose = () => {
    if (updateMutation.isPending) {
      return;
    }
    if (hasChanges) {
      const confirmed = window.confirm(
        "Hay cambios sin guardar. ¿Querés cerrar y descartarlos?",
      );
      if (!confirmed) {
        return;
      }
    }
    discardAndClose();
  };

  const persist = async () => {
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        ...formValues,
        expectedUpdatedAt: settings.updatedAt,
      });
      onSaved("Cuotas de WhatsApp guardadas correctamente.");
      setEnforceConfirmOpen(false);
      onClose();
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
      setEnforceConfirmOpen(false);
    }
  };

  const handleSave = async () => {
    if (!canUpdate || !hasChanges || !isValid || updateMutation.isPending) {
      return;
    }
    if (activatingEnforce) {
      setEnforceConfirmOpen(true);
      return;
    }
    await persist();
  };

  const update = (patch: Partial<WhatsAppQuotaFormValues>) => {
    setFormValues((prev) => ({ ...prev, ...patch }));
  };

  const shadow = settings.shadowSummary;

  return (
    <>
      <SettingsDialog
        opened={opened}
        onClose={handleClose}
        title="Cuotas de WhatsApp"
        subtitle="Controlá el consumo de mensajes no críticos. La asistencia crítica nunca se bloquea por cuota."
        onSave={handleSave}
        saving={updateMutation.isPending}
        saveDisabled={!canUpdate || !hasChanges || !isValid}
        saveLabel="Guardar cuotas"
        submitError={submitError}
        size="xl"
      >
        <Stack gap="lg">
          <Stack gap="sm">
            <Title order={5}>Estado del control</Title>
            <Alert color="blue" variant="light">
              <Text size="sm">
                <strong>Modo global:</strong> {settings.globalMode}
                {" · "}
                <strong>Modo efectivo:</strong> {settings.effectiveMode}
              </Text>
              <Text size="sm" c="dimmed" mt={4}>
                {effectiveModeReasonLabel(settings.effectiveModeReason)}
              </Text>
              {!effectiveWillBeEnforce && formValues.companyMode === "ENFORCE" ? (
                <Text size="sm" mt="xs">
                  Aunque selecciones ENFORCE en la empresa, el modo efectivo no será ENFORCE
                  mientras el modo global no sea ENFORCE.
                </Text>
              ) : null}
            </Alert>

            <FormGrid columns={{ base: 1, md: 2 }}>
              <SettingsFormField
                label="Modo de cuota de la empresa"
                description={modeDescription(formValues.companyMode)}
              >
                <Select
                  data={MODE_OPTIONS}
                  value={formValues.companyMode}
                  onChange={(value) => {
                    if (value === "OFF" || value === "SHADOW" || value === "ENFORCE") {
                      update({ companyMode: value });
                    }
                  }}
                  disabled={disabled}
                  aria-label="Modo de cuota de la empresa"
                />
              </SettingsFormField>

              <SettingsFormField
                label="Zona horaria"
                description="Se administra en Configuración operativa. Solo lectura aquí."
              >
                <Text size="sm" py={8}>
                  {settings.timezoneId}
                </Text>
              </SettingsFormField>

              <SettingsFormField
                label="Aviso al alcanzar un límite"
                description="Envía un mensaje breve cuando se bloquea una consulta no crítica (ENFORCE)."
              >
                <Switch
                  checked={formValues.limitNoticeEnabled}
                  onChange={(event) =>
                    update({ limitNoticeEnabled: event.currentTarget.checked })
                  }
                  disabled={disabled}
                  label={formValues.limitNoticeEnabled ? "Activado" : "Desactivado"}
                  aria-label="Aviso al alcanzar un límite"
                />
              </SettingsFormField>
            </FormGrid>

            <Group gap="xs">
              <Badge variant="light">Actualizado: {new Date(settings.updatedAt).toLocaleString()}</Badge>
              {settings.updatedBy ? (
                <Badge variant="outline">Por: {settings.updatedBy}</Badge>
              ) : null}
            </Group>
          </Stack>

          <Stack gap="sm">
            <Title order={5}>Límites por empleado</Title>
            <Text size="xs" c="dimmed">
              Cero bloquea por completo ese control. Para desactivar todas las cuotas usá modo OFF.
            </Text>
            <FormGrid columns={{ base: 1, md: 2 }}>
              <SettingsFormField
                label="Turnos diarios"
                description={`Máx. ${settings.limits.maxDailyTurns}. Unidad: turnos inbound no críticos / día.`}
              >
                <NumberInput
                  value={formValues.dailyTurns}
                  onChange={(value) =>
                    update({ dailyTurns: typeof value === "number" ? value : 0 })
                  }
                  min={0}
                  max={settings.limits.maxDailyTurns}
                  hideControls
                  disabled={disabled}
                  aria-label="Turnos diarios"
                />
              </SettingsFormField>
              <SettingsFormField
                label="Turnos semanales"
                description={`Máx. ${settings.limits.maxWeeklyTurns}. Semana ISO (lunes).`}
              >
                <NumberInput
                  value={formValues.weeklyTurns}
                  onChange={(value) =>
                    update({ weeklyTurns: typeof value === "number" ? value : 0 })
                  }
                  min={0}
                  max={settings.limits.maxWeeklyTurns}
                  hideControls
                  disabled={disabled}
                  aria-label="Turnos semanales"
                />
              </SettingsFormField>
              <SettingsFormField
                label="Ráfaga (turnos)"
                description={`Máx. ${settings.limits.maxBurstTurns} en la ventana móvil.`}
              >
                <NumberInput
                  value={formValues.burstTurns}
                  onChange={(value) =>
                    update({ burstTurns: typeof value === "number" ? value : 0 })
                  }
                  min={0}
                  max={settings.limits.maxBurstTurns}
                  hideControls
                  disabled={disabled}
                  aria-label="Turnos de ráfaga"
                />
              </SettingsFormField>
              <SettingsFormField
                label="Ventana de ráfaga (segundos)"
                description={`${settings.limits.minBurstWindowSeconds}–${settings.limits.maxBurstWindowSeconds} s.`}
              >
                <NumberInput
                  value={formValues.burstWindowSeconds}
                  onChange={(value) =>
                    update({ burstWindowSeconds: typeof value === "number" ? value : 60 })
                  }
                  min={settings.limits.minBurstWindowSeconds}
                  max={settings.limits.maxBurstWindowSeconds}
                  hideControls
                  disabled={disabled}
                  aria-label="Ventana de ráfaga en segundos"
                />
              </SettingsFormField>
              <SettingsFormField
                label="Respuestas salientes diarias"
                description="TwiML y documentos no críticos por empleado / día."
              >
                <NumberInput
                  value={formValues.dailyOutbounds}
                  onChange={(value) =>
                    update({ dailyOutbounds: typeof value === "number" ? value : 0 })
                  }
                  min={0}
                  max={settings.limits.maxDailyOutbounds}
                  hideControls
                  disabled={disabled}
                  aria-label="Respuestas salientes diarias"
                />
              </SettingsFormField>
              <SettingsFormField
                label="Respuestas salientes semanales"
                description="Por empleado / semana."
              >
                <NumberInput
                  value={formValues.weeklyOutbounds}
                  onChange={(value) =>
                    update({ weeklyOutbounds: typeof value === "number" ? value : 0 })
                  }
                  min={0}
                  max={settings.limits.maxWeeklyOutbounds}
                  hideControls
                  disabled={disabled}
                  aria-label="Respuestas salientes semanales"
                />
              </SettingsFormField>
            </FormGrid>
          </Stack>

          <Stack gap="sm">
            <Title order={5}>Límite general de la empresa</Title>
            <SettingsFormField
              label="Respuestas salientes diarias (empresa)"
              description={`Tope compartido entre todos los empleados. Máx. ${settings.limits.maxCompanyDailyOutbounds}.`}
            >
              <NumberInput
                value={formValues.companyDailyOutbounds}
                onChange={(value) =>
                  update({ companyDailyOutbounds: typeof value === "number" ? value : 0 })
                }
                min={0}
                max={settings.limits.maxCompanyDailyOutbounds}
                hideControls
                disabled={disabled}
                aria-label="Respuestas salientes diarias de la empresa"
              />
            </SettingsFormField>
          </Stack>

          {validationErrors.length > 0 ? (
            <Alert color="red" title="Revisá los valores">
              <Stack gap={4}>
                {validationErrors.map((error) => (
                  <Text key={error} size="sm">
                    {error}
                  </Text>
                ))}
              </Stack>
            </Alert>
          ) : null}

          {shadow ? (
            <Stack gap="xs">
              <Title order={5}>Resumen SHADOW ({shadow.windowDays} días)</Title>
              <Text size="sm">
                Evaluados: {shadow.turnsEvaluated} · Would admit: {shadow.wouldAdmit} · Would
                reject: {shadow.wouldReject} · Empleados: {shadow.employeesAffected} · Outbounds
                would reject: {shadow.outboundWouldReject}
              </Text>
              {shadow.lastShadowEventAt ? (
                <Text size="xs" c="dimmed">
                  Último evento: {new Date(shadow.lastShadowEventAt).toLocaleString()}
                </Text>
              ) : (
                <Text size="xs" c="dimmed">
                  Sin eventos SHADOW en la ventana.
                </Text>
              )}
            </Stack>
          ) : null}
        </Stack>
      </SettingsDialog>

      <Modal
        opened={enforceConfirmOpen}
        onClose={() => setEnforceConfirmOpen(false)}
        title="Activar aplicación de cuotas"
        centered
      >
        <Stack gap="md">
          <Text size="sm">
            Al activar ENFORCE, las funciones no críticas de WhatsApp podrán ser rechazadas cuando
            el empleado o la empresa alcancen los límites. Las funciones críticas de asistencia
            continuarán disponibles.
          </Text>
          {effectiveWillBeEnforce ? (
            <Alert color="orange" variant="light">
              El modo efectivo pasará a ENFORCE (global y empresa en ENFORCE).
            </Alert>
          ) : (
            <Alert color="gray" variant="light">
              El modo de empresa será ENFORCE, pero el modo efectivo seguirá sin ser ENFORCE
              porque el modo global es {settings.globalMode}.
            </Alert>
          )}
          <Text size="sm">
            Límites: {formValues.dailyTurns}/{formValues.weeklyTurns} turnos · ráfaga{" "}
            {formValues.burstTurns}/{formValues.burstWindowSeconds}s · outbounds{" "}
            {formValues.dailyOutbounds}/{formValues.weeklyOutbounds} · empresa{" "}
            {formValues.companyDailyOutbounds}/día
          </Text>
          <Group justify="flex-end">
            <Button variant="default" onClick={() => setEnforceConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button color="orange" loading={updateMutation.isPending} onClick={() => void persist()}>
              Confirmar ENFORCE
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
