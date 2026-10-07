import { zodResolver } from "@hookform/resolvers/zod";
import {
  Anchor,
  Box,
  Button,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from "@mantine/core";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Navigate, Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { z } from "zod";
import { AuthPageLogo } from "../components/brand/AuthPageLogo";
import { FormErrorAlert } from "../design-system";
import { useAuth } from "../hooks/useAuth";
import { getApiErrorMessage } from "../utils/errors";
import { isSafeInternalPath } from "../utils/invitation-email";
import { persistTwoFactorChallenge } from "../utils/two-factor-challenge";
import classes from "./login-page.module.css";

const loginSchema = z.object({
  email: z.string().trim().email("Ingresá un email válido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const highlights = [
  "Servicios y operaciones en un solo panel",
  "Planificación y cobertura por empresa",
  "Seguimiento operativo y resolución de incidencias",
] as const;

export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    register,
    formState: { isSubmitting, errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  if (!isLoading && isAuthenticated) {
    const next = searchParams.get("next");
    const redirectTo = isSafeInternalPath(next)
      ? next
      : (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  const onSubmit = async (values: LoginFormValues) => {
    setErrorMessage(null);

    try {
      const result = await login(values.email, values.password);
      if (result.requiresTwoFactor) {
        persistTwoFactorChallenge(result.challengeToken);
        const next = searchParams.get("next");
        navigate("/login/2fa", {
          replace: true,
          state: {
            from: isSafeInternalPath(next)
              ? next
              : (location.state as { from?: string } | null)?.from,
          },
        });
        return;
      }
      const next = searchParams.get("next");
      if (isSafeInternalPath(next)) {
        navigate(next, { replace: true });
        return;
      }
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "Credenciales inválidas."));
    }
  };

  return (
    <Box className={classes.page}>
      <Box className={classes.layout}>
        <Box className={classes.brandPanel}>
          <Stack gap="lg" className={classes.brandContent}>
            <div>
              <AuthPageLogo onDark />
              <Title order={2} className={classes.brandTitle}>
                Planificá, detectá y resolvé en el día a día operativo.
              </Title>
              <Text size="sm" className={classes.brandTagline}>
                Una plataforma para coordinar servicios, equipos y situaciones que requieren atención.
              </Text>
            </div>

            <Stack gap="sm">
              {highlights.map((text) => (
                <Text key={text} size="sm" className={classes.highlight}>
                  {text}
                </Text>
              ))}
            </Stack>
          </Stack>
        </Box>

        <Box className={classes.formPanel}>
          <Stack w="100%" maw={420} gap="md">
            <div className={classes.mobileBrand}>
              <AuthPageLogo />
            </div>
            <Paper className={classes.formCard} radius="lg" withBorder p="xl">
            <Stack gap="lg">
              <div>
                <Title order={2}>Iniciar sesión</Title>
                <Text c="dimmed" size="sm" mt={4}>
                  Accedé al panel operativo de Dinamic Operations.
                </Text>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} noValidate>
                <Stack gap="md">
                  <FormErrorAlert message={errorMessage} />

                  <TextInput
                    {...register("email")}
                    label="Email"
                    type="email"
                    autoComplete="email"
                    autoFocus
                    disabled={isSubmitting}
                    error={errors.email?.message}
                  />

                  <Controller
                    control={control}
                    name="password"
                    render={({ field }) => (
                      <PasswordInput
                        {...field}
                        label="Contraseña"
                        autoComplete="current-password"
                        disabled={isSubmitting}
                        error={errors.password?.message}
                      />
                    )}
                  />

                  <Button type="submit" fullWidth loading={isSubmitting} loaderProps={{ type: "dots" }}>
                    {isSubmitting ? "Ingresando..." : "Iniciar sesión"}
                  </Button>

                  <Text ta="center" size="sm">
                    <Anchor component={Link} to="/forgot-password">
                      ¿Olvidaste tu contraseña?
                    </Anchor>
                  </Text>
                </Stack>
              </form>
            </Stack>
            </Paper>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
