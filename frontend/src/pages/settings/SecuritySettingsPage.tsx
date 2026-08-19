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
  Title,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import QRCode from "qrcode";
import { z } from "zod";
import {
  confirmTwoFactor,
  disableTwoFactor,
  getTwoFactorStatus,
  regenerateRecoveryCodes,
  setupTwoFactor,
  type TwoFactorStatus,
} from "../../api/auth.api";
import { FormErrorAlert, LoadingState, PageHeader } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { getApiErrorMessage } from "../../utils/errors";
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

type ConfirmValues = z.infer<typeof confirmSchema>;
type DisableValues = z.infer<typeof disableSchema>;
type RegenerateValues = z.infer<typeof regenerateSchema>;

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
      <Stack>
        <PageHeader title="Seguridad" />
        <Title order={4}>Códigos de recuperación</Title>
        <RecoveryCodesPanel
          codes={freshRecoveryCodes}
          onConfirmSaved={() => {
            persistRecoveryCodesOnce(freshRecoveryCodes);
            logout();
            navigate("/login/2fa-recovery", { replace: true });
          }}
        />
      </Stack>
    );
  }

  return (
    <Stack gap="xl">
      <PageHeader
        title="Seguridad"
        description="Contraseña y autenticación en dos pasos de tu cuenta."
      />

      <Stack gap="xs">
        <Title order={4}>Autenticación en dos pasos</Title>
        <Group gap="xs">
          <Text size="sm" c="dimmed">
            Estado:
          </Text>
          <Badge color={status.enabled ? "green" : "gray"}>
            {status.enabled ? "Activada" : "Desactivada"}
          </Badge>
        </Group>
        {status.enabled ? (
          <Text size="sm">Códigos de recuperación restantes: {status.remainingRecoveryCodes}</Text>
        ) : null}
      </Stack>

      <FormErrorAlert message={actionError} />

      {!status.enabled && !setupUri ? (
        <Button
          w="fit-content"
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

      {setupUri && setupSecret ? (
        <Stack maw={420} gap="md">
          <Text size="sm">
            Escaneá el código QR con tu aplicación autenticadora o ingresá la clave manualmente.
          </Text>
          {qrDataUrl ? (
            <Image src={qrDataUrl} alt="Código QR de autenticación en dos pasos" w={220} />
          ) : null}
          <Text size="sm" ff="monospace">
            {setupSecret}
          </Text>
          <form
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
                setActionError(getApiErrorMessage(error, "No se pudo confirmar el código."));
              }
            })}
          >
            <Stack>
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
              <Button type="submit" loading={confirmForm.formState.isSubmitting}>
                Confirmar y activar
              </Button>
            </Stack>
          </form>
        </Stack>
      ) : null}

      {status.enabled ? (
        <Stack maw={420} gap="lg">
          <Alert color="yellow" title="Acción sensible">
            Desactivar 2FA o regenerar códigos requiere tu contraseña y un segundo factor.
          </Alert>

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
            <Stack>
              <Title order={5}>Regenerar códigos de recuperación</Title>
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
              <Button type="submit" variant="light" loading={regenerateForm.formState.isSubmitting}>
                Regenerar códigos
              </Button>
            </Stack>
          </form>

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
            <Stack>
              <Title order={5}>Desactivar autenticación en dos pasos</Title>
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
              <Button type="submit" color="red" loading={disableForm.formState.isSubmitting}>
                Desactivar
              </Button>
            </Stack>
          </form>
        </Stack>
      ) : null}
    </Stack>
  );
}
