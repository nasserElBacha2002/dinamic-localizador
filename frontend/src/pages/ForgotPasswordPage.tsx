import { zodResolver } from "@hookform/resolvers/zod";
import { Anchor, Box, Button, Paper, Stack, Text, TextInput, Title } from "@mantine/core";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router";
import { z } from "zod";
import { requestPasswordReset } from "../api/auth.api";
import { FormErrorAlert } from "../design-system";
import { getApiErrorMessage } from "../utils/errors";
import classes from "./login-page.module.css";

const forgotSchema = z.object({
  email: z.string().trim().email("Ingresá un email válido"),
});

type ForgotFormValues = z.infer<typeof forgotSchema>;

const GENERIC_SUCCESS =
  "Si existe una cuenta asociada a ese email, recibirás instrucciones para restablecer tu contraseña.";

export function ForgotPasswordPage() {
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { isSubmitting, errors },
  } = useForm<ForgotFormValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values: ForgotFormValues) => {
    setErrorMessage(null);
    try {
      await requestPasswordReset(values.email);
      setSubmitted(true);
    } catch (error) {
      setErrorMessage(getApiErrorMessage(error, "No se pudieron enviar las instrucciones."));
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
                  <Title order={2}>Restablecer contraseña</Title>
                  <Text c="dimmed" size="sm" mt={4}>
                    Ingresá tu email y te enviaremos instrucciones si hay una cuenta asociada.
                  </Text>
                </div>

                {submitted ? (
                  <Stack gap="md">
                    <Text size="sm">{GENERIC_SUCCESS}</Text>
                    <Anchor component={Link} to="/login">
                      Volver a iniciar sesión
                    </Anchor>
                  </Stack>
                ) : (
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
                      <Button type="submit" fullWidth loading={isSubmitting} loaderProps={{ type: "dots" }}>
                        Enviar instrucciones
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
