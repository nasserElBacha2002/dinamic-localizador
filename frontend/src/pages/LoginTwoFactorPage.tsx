import { zodResolver } from "@hookform/resolvers/zod";
import { Anchor, Box, Button, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, Navigate, useLocation, useNavigate } from "react-router";
import { z } from "zod";
import { loginWithTwoFactor } from "../api/auth.api";
import { FormErrorAlert } from "../design-system";
import { useAuth } from "../hooks/useAuth";
import { getApiErrorCode, getApiErrorMessage } from "../utils/errors";
import { isSafeInternalPath } from "../utils/invitation-email";
import {
  clearTwoFactorChallenge,
  readTwoFactorChallenge,
} from "../utils/two-factor-challenge";
import classes from "./login-page.module.css";

const totpSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Ingresá el código de 6 dígitos"),
});

const recoverySchema = z.object({
  recoveryCode: z.string().trim().min(8, "Ingresá un código de recuperación"),
});

type TotpValues = z.infer<typeof totpSchema>;
type RecoveryValues = z.infer<typeof recoverySchema>;

export function LoginTwoFactorPage() {
  const { completeTwoFactorLogin, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const challengeToken = readTwoFactorChallenge();

  const totpForm = useForm<TotpValues>({
    resolver: zodResolver(totpSchema),
    defaultValues: { code: "" },
  });
  const recoveryForm = useForm<RecoveryValues>({
    resolver: zodResolver(recoverySchema),
    defaultValues: { recoveryCode: "" },
  });

  if (!isLoading && isAuthenticated) {
    const redirectTo =
      (location.state as { from?: string } | null)?.from &&
      isSafeInternalPath((location.state as { from?: string }).from)
        ? (location.state as { from: string }).from
        : "/";
    return <Navigate to={redirectTo} replace />;
  }

  if (!challengeToken) {
    return <Navigate to="/login" replace />;
  }

  const finish = async (input: { code?: string; recoveryCode?: string }) => {
    setErrorMessage(null);
    try {
      const result = await loginWithTwoFactor({ challengeToken, ...input });
      clearTwoFactorChallenge();
      completeTwoFactorLogin(result.token, result.user);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(isSafeInternalPath(from) ? from : "/", { replace: true });
    } catch (error) {
      const message = getApiErrorMessage(error, "Código de autenticación inválido.");
      if (getApiErrorCode(error) === "INVALID_TWO_FACTOR_CHALLENGE") {
        clearTwoFactorChallenge();
        setErrorMessage("El desafío expiró. Volvé a iniciar sesión.");
        navigate("/login", { replace: true, state: { twoFactorExpired: true } });
        return;
      }
      setErrorMessage(message);
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
                  <Title order={2}>Verificación en dos pasos</Title>
                  <Text c="dimmed" size="sm" mt={4}>
                    {useRecovery
                      ? "Ingresá un código de recuperación de un solo uso."
                      : "Ingresá el código de tu aplicación autenticadora."}
                  </Text>
                </div>

                {useRecovery ? (
                  <form
                    onSubmit={recoveryForm.handleSubmit((values) =>
                      finish({ recoveryCode: values.recoveryCode }),
                    )}
                    noValidate
                  >
                    <Stack gap="md">
                      <FormErrorAlert message={errorMessage} />
                      <TextInput
                        {...recoveryForm.register("recoveryCode")}
                        label="Código de recuperación"
                        autoComplete="off"
                        autoFocus
                        disabled={recoveryForm.formState.isSubmitting}
                        error={recoveryForm.formState.errors.recoveryCode?.message}
                      />
                      <Button
                        type="submit"
                        fullWidth
                        loading={recoveryForm.formState.isSubmitting}
                        loaderProps={{ type: "dots" }}
                      >
                        Verificar
                      </Button>
                      <Anchor
                        component="button"
                        type="button"
                        size="sm"
                        onClick={() => {
                          setUseRecovery(false);
                          setErrorMessage(null);
                        }}
                      >
                        Usar código de autenticación
                      </Anchor>
                    </Stack>
                  </form>
                ) : (
                  <form
                    onSubmit={totpForm.handleSubmit((values) => finish({ code: values.code }))}
                    noValidate
                  >
                    <Stack gap="md">
                      <FormErrorAlert message={errorMessage} />
                      <TextInput
                        {...totpForm.register("code")}
                        label="Código de autenticación"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        disabled={totpForm.formState.isSubmitting}
                        error={totpForm.formState.errors.code?.message}
                      />
                      <Button
                        type="submit"
                        fullWidth
                        loading={totpForm.formState.isSubmitting}
                        loaderProps={{ type: "dots" }}
                      >
                        Verificar
                      </Button>
                      <Anchor
                        component="button"
                        type="button"
                        size="sm"
                        onClick={() => {
                          setUseRecovery(true);
                          setErrorMessage(null);
                        }}
                      >
                        Usar un código de recuperación
                      </Anchor>
                    </Stack>
                  </form>
                )}

                <Anchor component={Link} to="/login" onClick={() => clearTwoFactorChallenge()}>
                  Volver a iniciar sesión
                </Anchor>
              </Stack>
            </Paper>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
