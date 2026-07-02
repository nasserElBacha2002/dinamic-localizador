import { zodResolver } from "@hookform/resolvers/zod";
import {
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
import { Navigate, useLocation } from "react-router-dom";
import { z } from "zod";
import { FormErrorAlert } from "../design-system";
import { useAuth } from "../hooks/useAuth";
import { getApiErrorMessage } from "../utils/errors";
import classes from "./login-page.module.css";

const loginSchema = z.object({
  email: z.string().trim().email("Ingresá un email válido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const highlights = [
  "Validación de llegada por ubicación",
  "Operaciones multiempresa",
  "Seguimiento de asistencias en tiempo real",
] as const;

export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
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
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  const onSubmit = async (values: LoginFormValues) => {
    setErrorMessage(null);

    try {
      await login(values.email, values.password);
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
              <Text className={classes.brandEyebrow}>Dinamic Attendance</Text>
              <Title order={2} className={classes.brandTitle}>
                Control operativo de asistencias por WhatsApp y geocerca.
              </Title>
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
              <Text className={classes.brandEyebrow} c="brand" fw={600}>
                Dinamic Attendance
              </Text>
            </div>
            <Paper className={classes.formCard} radius="lg" withBorder shadow="md" p="xl">
            <Stack gap="lg">
              <div>
                <Title order={2}>Iniciar sesión</Title>
                <Text c="dimmed" size="sm" mt={4}>
                  Accedé al panel operativo de Dinamic Attendance.
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
