import { zodResolver } from "@hookform/resolvers/zod";
import {
  Alert,
  Anchor,
  Box,
  Button,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router";
import { z } from "zod";
import { acceptInvitation, declineInvitation, previewInvitation } from "../../api/invitations.api";
import { FormErrorAlert, LoadingState } from "../../design-system";
import { useAuth } from "../../hooks/useAuth";
import { useCompany } from "../../hooks/useCompany";
import type { UserInvitationPreview } from "../../types/user-invitation";
import { getApiErrorMessage } from "../../utils/errors";
import {
  clearPersistedInvitationToken,
  emailMatchesMasked,
  persistInvitationToken,
  readPersistedInvitationToken,
} from "../../utils/invitation-email";
import { companyRoleLabels } from "../../utils/labels";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../../utils/password-policy";
import classes from "../login-page.module.css";

const INVITATION_ACCEPT_PATH = "/invitations/accept";

const registrationSchema = z
  .object({
    email: z.string().trim().email("Ingresá un email válido"),
    name: z.string().trim().min(1, "El nombre es obligatorio"),
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
      .max(PASSWORD_MAX_LENGTH, `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres`),
    passwordConfirmation: z.string().min(PASSWORD_MIN_LENGTH, "Confirmá la contraseña"),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirmation"],
  });

type RegistrationFormValues = z.infer<typeof registrationSchema>;

function readTokenFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("token")?.trim();
  if (fromQuery) {
    return fromQuery;
  }
  return readPersistedInvitationToken();
}

function stripTokenFromUrl(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("token")) {
    return;
  }
  url.searchParams.delete("token");
  const nextSearch = url.searchParams.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${url.hash}`;
  window.history.replaceState(window.history.state, "", nextUrl);
}

type PagePhase = "loading" | "invalid" | "ready";

export function AcceptInvitationPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: authLoading, login } = useAuth();
  const { refreshCompanies } = useCompany();
  const [token] = useState(() => readTokenFromLocation());
  const [phase, setPhase] = useState<PagePhase>("loading");
  const [preview, setPreview] = useState<UserInvitationPreview | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);

  const {
    control,
    handleSubmit,
    register,
    reset,
    formState: { errors },
  } = useForm<RegistrationFormValues>({
    resolver: zodResolver(registrationSchema),
    defaultValues: {
      email: "",
      name: "",
      password: "",
      passwordConfirmation: "",
    },
  });

  useEffect(() => {
    if (token) {
      persistInvitationToken(token);
      stripTokenFromUrl();
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setPhase("invalid");
      setErrorMessage("El enlace de invitación no es válido o está incompleto.");
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const data = await previewInvitation(token);
        if (cancelled) {
          return;
        }
        setPreview(data);
        setPhase(data.status === "PENDING" ? "ready" : "invalid");
        if (data.status !== "PENDING") {
          setErrorMessage("Esta invitación ya no está disponible.");
          return;
        }
        reset({
          email: data.email,
          name: data.inviteeName?.trim() || "",
          password: "",
          passwordConfirmation: "",
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        setPhase("invalid");
        setErrorMessage(getApiErrorMessage(error, "No pudimos validar la invitación."));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token, reset]);

  const sessionMatchesInvitee = useMemo(() => {
    if (!preview || !user) {
      return false;
    }
    if (preview.email) {
      return user.email.trim().toLowerCase() === preview.email.trim().toLowerCase();
    }
    return emailMatchesMasked(user.email, preview.emailMasked);
  }, [preview, user]);

  const wrongUserLoggedIn = Boolean(
    preview?.userExists && isAuthenticated && user && !sessionMatchesInvitee,
  );

  const loginNext = encodeURIComponent(INVITATION_ACCEPT_PATH);

  const finishAcceptance = async (options: { isNewUser: boolean; email?: string; password?: string }) => {
    if (options.isNewUser) {
      if (!options.email || !options.password) {
        throw new Error("Missing credentials for new user login.");
      }
      await login(options.email, options.password);
    }
    await refreshCompanies();
    clearPersistedInvitationToken();
    navigate("/", { replace: true });
  };

  const runAccept = async (registration?: RegistrationFormValues) => {
    if (!token || !preview || submitting || submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      const result = await acceptInvitation({
        token,
        name: registration?.name.trim(),
        password: registration?.password,
        passwordConfirmation: registration?.passwordConfirmation,
      });

      const loginEmail =
        preview.userExists && user?.email
          ? user.email
          : preview.email || registration?.email;

      await finishAcceptance({
        isNewUser: Boolean(result.data.isNewUser),
        email: loginEmail,
        password: registration?.password,
      });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const runDecline = async () => {
    if (!token || !preview || submitting || submitLockRef.current) {
      return;
    }

    submitLockRef.current = true;
    setSubmitting(true);
    setErrorMessage(null);

    try {
      await declineInvitation(token);
      clearPersistedInvitationToken();
      notifications.show({
        color: "green",
        message: "Invitación rechazada. No se te agregó a la empresa.",
      });
      navigate(isAuthenticated ? "/" : "/login", { replace: true });
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error));
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const onRegistrationSubmit = handleSubmit(async (values) => {
    const lockedEmail = preview?.email?.trim().toLowerCase() ?? "";
    const submittedEmail = values.email.trim().toLowerCase();
    if (!lockedEmail || submittedEmail !== lockedEmail) {
      setErrorMessage("El email no coincide con el destinatario de la invitación.");
      return;
    }
    await runAccept({ ...values, email: lockedEmail });
  });

  const renderBody = () => {
    if (authLoading || phase === "loading") {
      return <LoadingState message="Validando invitación..." />;
    }

    if (phase === "invalid" || !preview) {
      return (
        <Stack gap="md">
          <Alert color="red" title="Invitación no disponible">
            {errorMessage || "Este enlace no es válido o expiró."}
          </Alert>
          <Button component={Link} to="/login" variant="light">
            Ir a iniciar sesión
          </Button>
        </Stack>
      );
    }

    return (
      <Stack gap="md">
        <div>
          <Title order={3}>Invitación a {preview.companyName}</Title>
          <Text c="dimmed" size="sm" mt={4}>
            Te invitaron como {companyRoleLabels[preview.role]} ({preview.email}).
          </Text>
        </div>

        <FormErrorAlert message={errorMessage} />

        {wrongUserLoggedIn ? (
          <Alert color="orange" title="Sesión incorrecta">
            <Stack gap="xs">
              <Text size="sm">
                Iniciaste sesión como {user?.email}, pero la invitación fue enviada a{" "}
                {preview.email}. Cerrá sesión e ingresá con la cuenta invitada.
              </Text>
              <Anchor component={Link} to={`/login?next=${loginNext}`}>
                Iniciar sesión con otra cuenta
              </Anchor>
            </Stack>
          </Alert>
        ) : null}

        {!preview.userExists ? (
          <form onSubmit={onRegistrationSubmit} noValidate>
            <Stack gap="md">
              <Text size="sm" c="dimmed">
                Creá tu cuenta para aceptar la invitación enviada a {preview.email}.
              </Text>
              <TextInput
                {...register("email")}
                label="Email"
                type="email"
                autoComplete="email"
                readOnly
                disabled
                description="El email está definido por la invitación y no se puede cambiar."
                error={errors.email?.message}
              />
              <TextInput
                {...register("name")}
                label="Nombre"
                autoComplete="name"
                disabled={submitting}
                error={errors.name?.message}
              />
              <Controller
                control={control}
                name="password"
                render={({ field }) => (
                  <PasswordInput
                    {...field}
                    label="Contraseña"
                    autoComplete="new-password"
                    disabled={submitting}
                    error={errors.password?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="passwordConfirmation"
                render={({ field }) => (
                  <PasswordInput
                    {...field}
                    label="Confirmar contraseña"
                    autoComplete="new-password"
                    disabled={submitting}
                    error={errors.passwordConfirmation?.message}
                  />
                )}
              />
              <Button type="submit" loading={submitting} loaderProps={{ type: "dots" }}>
                Crear cuenta y aceptar
              </Button>
              <Button
                type="button"
                variant="default"
                disabled={submitting}
                onClick={() => void runDecline()}
              >
                Rechazar invitación
              </Button>
            </Stack>
          </form>
        ) : null}

        {preview.userExists && !isAuthenticated ? (
          <Alert color="blue" title="Ya tenés cuenta">
            <Stack gap="xs">
              <Text size="sm">
                Iniciá sesión con {preview.email} para aceptar o rechazar el acceso a{" "}
                {preview.companyName}.
              </Text>
              <TextInput
                label="Email"
                value={preview.email}
                readOnly
                disabled
                description="El email está definido por la invitación y no se puede cambiar."
              />
              <Button component={Link} to={`/login?next=${loginNext}`} variant="light">
                Iniciar sesión
              </Button>
            </Stack>
          </Alert>
        ) : null}

        {preview.userExists && isAuthenticated && sessionMatchesInvitee ? (
          <Stack gap="sm">
            <Text size="sm">
              Aceptá la invitación para unirte a {preview.companyName} como{" "}
              {companyRoleLabels[preview.role]}, o rechazala si no querés unirte.
            </Text>
            <Group grow>
              <Button
                loading={submitting}
                loaderProps={{ type: "dots" }}
                onClick={() => void runAccept()}
              >
                Aceptar invitación
              </Button>
              <Button
                variant="default"
                disabled={submitting}
                onClick={() => void runDecline()}
              >
                Rechazar
              </Button>
            </Group>
          </Stack>
        ) : null}
      </Stack>
    );
  };

  return (
    <Box className={classes.page}>
      <Box className={classes.layout}>
        <Box className={classes.brandPanel}>
          <Stack gap="lg" className={classes.brandContent}>
            <div>
              <Text className={classes.brandEyebrow}>Dinamic Attendance</Text>
              <Title order={2} className={classes.brandTitle}>
                Sumate al equipo operativo de tu empresa.
              </Title>
            </div>
          </Stack>
        </Box>

        <Box className={classes.formPanel}>
          <Stack w="100%" maw={420} gap="md">
            <div className={classes.mobileBrand}>
              <Text className={classes.brandEyebrow} c="brand" fw={600}>
                Dinamic Attendance
              </Text>
            </div>
            <Paper className={classes.formCard} radius="lg" withBorder shadow="md" p="xl">
              {renderBody()}
            </Paper>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
