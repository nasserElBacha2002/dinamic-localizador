import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Badge,
  Button,
  Group,
  Image,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import QRCode from "qrcode";
import { z } from "zod";
import {
  cancelTwoFactorReconfigure,
  confirmTwoFactor,
  confirmTwoFactorReconfigure,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  setupTwoFactor,
  startTwoFactorReconfigure,
  type TwoFactorStatus,
} from "../../api/auth.api";
import { FormErrorAlert, FormGrid, LoadingState, PageHeader, SectionCard } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { getApiErrorCode, getApiErrorMessage } from "../../utils/errors";
import { persistRecoveryCodesOnce } from "../../utils/two-factor-recovery-display";
import { RecoveryCodesPanel } from "./RecoveryCodesPanel";

const confirmSchema = z.object({
  password: z.string().min(1, "La contraseña es obligatoria"),
  code: z.string().trim().regex(/^\d{6}$/, "Ingresá el código de 6 dígitos"),
});

const disableSchema = z
  .object({
    password: z.string().min(1, "La contraseña es obligatoria"),
    code: z.string().trim().optional(),
    recoveryCode: z.string().trim().optional(),
  })
  .refine((values) => Boolean(values.code?.match(/^\d{6}$/)) !== Boolean(values.recoveryCode), {
    message: "Indicá un código TOTP o un código de recuperación.",
    path: ["code"],
  });

const regenerateSchema = z.object({
  password: z.string().min(1, "La contraseña es obligatoria"),
  code: z.string().trim().regex(/^\d{6}$/, "Ingresá el código de 6 dígitos"),
});

const reconfigureSetupSchema = z
  .object({
    password: z.string().min(1, "La contraseña es obligatoria"),
    code: z.string().trim().optional(),
    recoveryCode: z.string().trim().optional(),
  })
  .refine((values) => Boolean(values.code?.match(/^\d{6}$/)) !== Boolean(values.recoveryCode), {
    message: "Indicá un código TOTP o un código de recuperación.",
    path: ["code"],
  });

const reconfigureConfirmSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Ingresá el código de 6 dígitos"),
});

type ConfirmValues = z.infer<typeof confirmSchema>;
type DisableValues = z.infer<typeof disableSchema>;
type RegenerateValues = z.infer<typeof regenerateSchema>;
type ReconfigureSetupValues = z.infer<typeof reconfigureSetupSchema>;
type ReconfigureConfirmValues = z.infer<typeof reconfigureConfirmSchema>;

export function SecuritySettingsPage() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [setupUri, setSetupUri] = useState<string | null>(null);
  const [setupSecret, setSetupSecret] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [freshRecoveryCodes, setFreshRecoveryCodes] = useState<string[] | null>(null);
  const [reconfigureSecret, setReconfigureSecret] = useState<string | null>(null);
  const [reconfigureUri, setReconfigureUri] = useState<string | null>(null);
  const [reconfigureQr, setReconfigureQr] = useState<string | null>(null);

  const confirmForm = useForm<ConfirmValues>({
    resolver: zodResolver(confirmSchema),
    defaultValues: { password: "", code: "" },
  });
  const disableForm = useForm<DisableValues>({
    resolver: zodResolver(disableSchema),
    defaultValues: { password: "", code: "", recoveryCode: "" },
  });
  const regenerateForm = useForm<RegenerateValues>({
    resolver: zodResolver(regenerateSchema),
    defaultValues: { password: "", code: "" },
  });
  const reconfigureSetupForm = useForm<ReconfigureSetupValues>({
    resolver: zodResolver(reconfigureSetupSchema),
    defaultValues: { password: "", code: "", recoveryCode: "" },
  });
  const reconfigureConfirmForm = useForm<ReconfigureConfirmValues>({
    resolver: zodResolver(reconfigureConfirmSchema),
    defaultValues: { code: "" },
  });

  const reload = async () => {
    const next = await getTwoFactorStatus();
    setStatus(next);
  };

  useEffect(() => {
    void (async () => {
      try {
        await reload();
      } catch (error) {
        setLoadError(getApiErrorMessage(error, "No se pudo cargar el estado de seguridad."));
      }
    })();
  }, []);

  if (loadError) {
    return (
      <Stack>
        <PageHeader title="Seguridad" />
        <FormErrorAlert message={loadError} />
      </Stack>
    );
  }

  if (!status) {
    return <LoadingState message="Cargando seguridad..." />;
  }

  if (freshRecoveryCodes) {
    return (
      <Stack gap="lg">
        <PageHeader title="Seguridad" />
        <SectionCard title="Códigos de recuperación">
          <RecoveryCodesPanel
            codes={freshRecoveryCodes}
            onConfirmSaved={() => {
              persistRecoveryCodesOnce(freshRecoveryCodes);
              logout();
              navigate("/login/2fa-recovery", { replace: true });
            }}
          />
        </SectionCard>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <PageHeader
        title="Seguridad"
        description="Contraseña y autenticación en dos pasos de tu cuenta."
      />

      <SectionCard
        title="Autenticación en dos pasos"
        action={
          <Badge color={status.enabled ? "green" : "gray"}>
            Estado: {status.enabled ? "Activada" : "Desactivada"}
          </Badge>
        }
      >
        <Group justify="space-between" align="flex-start" wrap="wrap" gap="md">
          {status.enabled ? (
            <Text size="sm">Códigos de recuperación restantes: {status.remainingRecoveryCodes}</Text>
          ) : (
            <Text size="sm" c="dimmed">
              Protegé el acceso a tu cuenta con un autenticador TOTP y códigos de recuperación.
            </Text>
          )}
          {!status.enabled && !setupUri ? (
            <Button
              onClick={async () => {
                setActionError(null);
                try {
                  const setup = await setupTwoFactor();
                  setSetupUri(setup.otpauthUri);
                  setSetupSecret(setup.secret);
                  setQrDataUrl(await QRCode.toDataURL(setup.otpauthUri, { margin: 1, width: 220 }));
                } catch (error) {
                  setActionError(getApiErrorMessage(error, "No se pudo iniciar la configuración."));
                }
              }}
            >
              Activar autenticación en dos pasos
            </Button>
          ) : null}
        </Group>
        {status.enabled && status.remainingRecoveryCodes === 0 ? (
          <Alert mt="md" color="red" title="Sin códigos de recuperación">
            No tenés códigos de recuperación disponibles. Generá nuevos códigos para evitar perder
            acceso a tu cuenta.
          </Alert>
        ) : null}
        {status.enabled && status.remainingRecoveryCodes > 0 && status.remainingRecoveryCodes <= 2 ? (
          <Alert mt="md" color="yellow" title="Quedan pocos códigos">
            Te quedan {status.remainingRecoveryCodes} códigos de recuperación. Regeneralos cuando
            puedas.
          </Alert>
        ) : null}
      </SectionCard>

      <FormErrorAlert message={actionError} />

      {setupUri && setupSecret ? (
        <SectionCard
          title="Activar autenticación en dos pasos"
          description="Escaneá el código QR con tu aplicación autenticadora o ingresá la clave manualmente."
        >
          <Group align="flex-start" wrap="wrap" gap="xl">
            <Stack gap="xs">
              {qrDataUrl ? (
                <Image src={qrDataUrl} alt="Código QR de autenticación en dos pasos" w={220} />
              ) : null}
              <Text size="sm" ff="monospace">
                {setupSecret}
              </Text>
            </Stack>
            <form
              style={{ flex: 1, minWidth: 280 }}
              onSubmit={confirmForm.handleSubmit(async (values) => {
                setActionError(null);
                try {
                  const confirmed = await confirmTwoFactor({
                    password: values.password,
                    code: values.code,
                  });
                  confirmForm.reset({ password: "", code: "" });
                  setSetupUri(null);
                  setSetupSecret(null);
                  setQrDataUrl(null);
                  setFreshRecoveryCodes(confirmed.recoveryCodes);
                } catch (error) {
                  setActionError(
                    getApiErrorCode(error) === "INVALID_TWO_FACTOR_CODE"
                      ? "Código inválido o ya usado. Esperá el siguiente código de 6 dígitos."
                      : getApiErrorMessage(error, "No se pudo confirmar el código."),
                  );
                }
              })}
            >
              <FormGrid columns={{ base: 1, sm: 2 }} align="start">
                <PasswordInput
                  {...confirmForm.register("password")}
                  label="Contraseña actual"
                  autoComplete="current-password"
                  error={confirmForm.formState.errors.password?.message}
                />
                <TextInput
                  {...confirmForm.register("code")}
                  label="Código de autenticación"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  error={confirmForm.formState.errors.code?.message}
                />
                <FormGrid.Full>
                  <Button type="submit" loading={confirmForm.formState.isSubmitting}>
                    Confirmar y activar
                  </Button>
                </FormGrid.Full>
              </FormGrid>
            </form>
          </Group>
        </SectionCard>
      ) : null}

      {status.enabled ? (
        <Stack gap="lg">
          <Alert color="yellow" title="Acción sensible">
            Desactivar 2FA, cambiar el autenticador o regenerar códigos requiere tu contraseña y un
            segundo factor.
          </Alert>

          {reconfigureUri && reconfigureSecret ? (
            <SectionCard
              title="Confirmá el nuevo autenticador"
              description="Escaneá el QR o ingresá la clave. El autenticador anterior sigue activo hasta confirmar."
            >
              <Group align="flex-start" wrap="wrap" gap="xl">
                <Stack gap="xs">
                  {reconfigureQr ? (
                    <Image src={reconfigureQr} alt="Código QR del nuevo autenticador" w={220} />
                  ) : null}
                  <Text size="sm" ff="monospace">
                    {reconfigureSecret}
                  </Text>
                </Stack>
                <form
                  style={{ flex: 1, minWidth: 280 }}
                  onSubmit={reconfigureConfirmForm.handleSubmit(async (values) => {
                    setActionError(null);
                    try {
                      const result = await confirmTwoFactorReconfigure({ code: values.code });
                      reconfigureConfirmForm.reset({ code: "" });
                      setReconfigureUri(null);
                      setReconfigureSecret(null);
                      setReconfigureQr(null);
                      setFreshRecoveryCodes(result.recoveryCodes);
                    } catch (error) {
                      setActionError(
                        getApiErrorCode(error) === "INVALID_TWO_FACTOR_CODE"
                          ? "Código inválido o ya usado. Esperá el siguiente código de 6 dígitos."
                          : getApiErrorMessage(error, "No se pudo confirmar el nuevo autenticador."),
                      );
                    }
                  })}
                >
                  <FormGrid columns={{ base: 1, sm: 2 }} align="start">
                    <TextInput
                      {...reconfigureConfirmForm.register("code")}
                      label="Código del nuevo autenticador"
                      inputMode="numeric"
                      error={reconfigureConfirmForm.formState.errors.code?.message}
                    />
                    <Group align="flex-end" h="100%">
                      <Button type="submit" loading={reconfigureConfirmForm.formState.isSubmitting}>
                        Confirmar nuevo autenticador
                      </Button>
                      <Button
                        type="button"
                        variant="subtle"
                        onClick={async () => {
                          setActionError(null);
                          try {
                            await cancelTwoFactorReconfigure();
                            setReconfigureUri(null);
                            setReconfigureSecret(null);
                            setReconfigureQr(null);
                            await reload();
                          } catch (error) {
                            setActionError(
                              getApiErrorMessage(error, "No se pudo cancelar la reconfiguración."),
                            );
                          }
                        }}
                      >
                        Cancelar
                      </Button>
                    </Group>
                  </FormGrid>
                </form>
              </Group>
            </SectionCard>
          ) : (
            <SectionCard title="Cambiar autenticador">
              <form
                onSubmit={reconfigureSetupForm.handleSubmit(async (values) => {
                  setActionError(null);
                  try {
                    const setup = await startTwoFactorReconfigure({
                      password: values.password,
                      code: values.code || undefined,
                      recoveryCode: values.recoveryCode || undefined,
                    });
                    reconfigureSetupForm.reset({ password: "", code: "", recoveryCode: "" });
                    setReconfigureUri(setup.otpauthUri);
                    setReconfigureSecret(setup.secret);
                    setReconfigureQr(await QRCode.toDataURL(setup.otpauthUri, { margin: 1, width: 220 }));
                  } catch (error) {
                    setActionError(
                      getApiErrorMessage(error, "No se pudo iniciar el cambio de autenticador."),
                    );
                  }
                })}
              >
                <FormGrid columns={{ base: 1, sm: 2, lg: 4 }} align="start">
                  <PasswordInput
                    {...reconfigureSetupForm.register("password")}
                    label="Contraseña actual"
                    error={reconfigureSetupForm.formState.errors.password?.message}
                  />
                  <TextInput
                    {...reconfigureSetupForm.register("code")}
                    label="Código TOTP actual"
                    inputMode="numeric"
                    error={reconfigureSetupForm.formState.errors.code?.message}
                  />
                  <TextInput
                    {...reconfigureSetupForm.register("recoveryCode")}
                    label="O código de recuperación"
                    error={reconfigureSetupForm.formState.errors.recoveryCode?.message}
                  />
                  <Group align="flex-end" h="100%">
                    <Button type="submit" variant="light" loading={reconfigureSetupForm.formState.isSubmitting}>
                      Cambiar autenticador
                    </Button>
                  </Group>
                </FormGrid>
              </form>
            </SectionCard>
          )}

          <SectionCard title="Regenerar códigos de recuperación">
            <form
              onSubmit={regenerateForm.handleSubmit(async (values) => {
                setActionError(null);
                try {
                  const result = await regenerateRecoveryCodes(values);
                  setFreshRecoveryCodes(result.recoveryCodes);
                } catch (error) {
                  setActionError(getApiErrorMessage(error, "No se pudieron regenerar los códigos."));
                }
              })}
            >
              <FormGrid columns={{ base: 1, sm: 2, lg: 3 }} align="start">
                <PasswordInput
                  {...regenerateForm.register("password")}
                  label="Contraseña actual"
                  error={regenerateForm.formState.errors.password?.message}
                />
                <TextInput
                  {...regenerateForm.register("code")}
                  label="Código TOTP"
                  inputMode="numeric"
                  error={regenerateForm.formState.errors.code?.message}
                />
                <Group align="flex-end" h="100%">
                  <Button type="submit" variant="light" loading={regenerateForm.formState.isSubmitting}>
                    Regenerar códigos
                  </Button>
                </Group>
              </FormGrid>
            </form>
          </SectionCard>

          <SectionCard title="Desactivar autenticación en dos pasos">
            <form
              onSubmit={disableForm.handleSubmit(async (values) => {
                setActionError(null);
                try {
                  await disableTwoFactor({
                    password: values.password,
                    code: values.code || undefined,
                    recoveryCode: values.recoveryCode || undefined,
                  });
                  logout();
                  navigate("/login", { replace: true });
                } catch (error) {
                  setActionError(getApiErrorMessage(error, "No se pudo desactivar 2FA."));
                }
              })}
            >
              <FormGrid columns={{ base: 1, sm: 2, lg: 4 }} align="start">
                <PasswordInput
                  {...disableForm.register("password")}
                  label="Contraseña actual"
                  error={disableForm.formState.errors.password?.message}
                />
                <TextInput
                  {...disableForm.register("code")}
                  label="Código TOTP"
                  inputMode="numeric"
                  error={disableForm.formState.errors.code?.message}
                />
                <TextInput
                  {...disableForm.register("recoveryCode")}
                  label="O código de recuperación"
                  error={disableForm.formState.errors.recoveryCode?.message}
                />
                <Group align="flex-end" h="100%">
                  <Button type="submit" color="red" loading={disableForm.formState.isSubmitting}>
                    Desactivar
                  </Button>
                </Group>
              </FormGrid>
            </form>
          </SectionCard>
        </Stack>
      ) : null}
    </Stack>
  );
}
