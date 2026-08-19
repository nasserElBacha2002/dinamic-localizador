import { zodResolver } from "@hookform/resolvers/zod";
import { Anchor, Box, Button, Paper, PasswordInput, Stack, Text, Title } from "@mantine/core";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";
import { resetPassword } from "../api/auth.api";
import { FormErrorAlert } from "../design-system";
import { getApiErrorMessage } from "../utils/errors";
import {
  clearPersistedPasswordResetToken,
  persistPasswordResetToken,
  readPersistedPasswordResetToken,
} from "../utils/password-reset-token";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "../utils/password-policy";
import classes from "./login-page.module.css";

const resetSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres`)
      .max(PASSWORD_MAX_LENGTH, `La contraseña no puede superar ${PASSWORD_MAX_LENGTH} caracteres`),
    passwordConfirmation: z.string().min(1, "Confirmá la contraseña"),
  })
  .refine((values) => values.password === values.passwordConfirmation, {
    message: "Las contraseñas no coinciden.",
    path: ["passwordConfirmation"],
  });

type ResetFormValues = z.infer<typeof resetSchema>;

function readTokenFromLocation(): string | null {
  const params = new URLSearchParams(window.location.search);
  const fromQuery = params.get("token")?.trim();
  if (fromQuery) {
    return fromQuery;
  }
  return readPersistedPasswordResetToken();
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

export function ResetPasswordPage() {
  const [token] = useState(() => readTokenFromLocation());
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(() =>
    token ? null : "El enlace de restablecimiento no es válido o está incompleto.",
  );

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<ResetFormValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", passwordConfirmation: "" },
  });

  useEffect(() => {
    if (token) {
      persistPasswordResetToken(token);
      stripTokenFromUrl();
    }
  }, [token]);

  const onSubmit = async (values: ResetFormValues) => {
    if (!token) {
      setErrorMessage("El enlace de restablecimiento no es válido o está incompleto.");
      return;
    }
    setErrorMessage(null);
    try {
      const result = await resetPassword({
        token,
        password: values.password,
        passwordConfirmation: values.passwordConfirmation,
      });
      clearPersistedPasswordResetToken();
      setSuccessMessage(result.message);
    } catch (error) {
      setErrorMessage(
        getApiErrorMessage(error, "No se pudo restablecer la contraseña. Solicitá un enlace nuevo."),
      );
    }
  };

  return (
    <Box className={classes.page}>
      <Box className={classes.centeredLayout}>
        <Box className={classes.formPanel}>
          <Stack w="100%" maw={420} gap="md">
            <Paper className={classes.formCard} radius="lg" withBorder shadow="md" p="xl">
              <Stack gap="lg">
                <div>
                  <Title order={2}>Nueva contraseña</Title>
                  <Text c="dimmed" size="sm" mt={4}>
                    Elegí una contraseña nueva. Después vas a tener que iniciar sesión.
                  </Text>
                </div>

                {successMessage ? (
                  <Stack gap="md">
                    <Text size="sm">{successMessage}</Text>
                    <Anchor component={Link} to="/login">
                      Ir a iniciar sesión
                    </Anchor>
                  </Stack>
                ) : (
                  <form onSubmit={handleSubmit(onSubmit)} noValidate>
                    <Stack gap="md">
                      <FormErrorAlert message={errorMessage} />
                      <Controller
                        control={control}
                        name="password"
                        render={({ field }) => (
                          <PasswordInput
                            {...field}
                            label="Nueva contraseña"
                            autoComplete="new-password"
                            disabled={isSubmitting || !token}
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
                            disabled={isSubmitting || !token}
                            error={errors.passwordConfirmation?.message}
                          />
                        )}
                      />
                      <Button
                        type="submit"
                        fullWidth
                        loading={isSubmitting}
                        disabled={!token}
                        loaderProps={{ type: "dots" }}
                      >
                        Restablecer contraseña
                      </Button>
                      <Text ta="center" size="sm">
                        <Anchor component={Link} to="/login">
                          Volver a iniciar sesión
                        </Anchor>
                      </Text>
                    </Stack>
                  </form>
                )}
              </Stack>
            </Paper>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
