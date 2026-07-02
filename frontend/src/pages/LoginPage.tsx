import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Card, Center, Stack, Text, Title } from "@mantine/core";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useLocation } from "react-router-dom";
import { z } from "zod";
import {
  FormErrorAlert,
  FormSection,
  RHFTextInput,
} from "../design-system";
import { useAuth } from "../hooks/useAuth";
import { getApiErrorMessage } from "../utils/errors";

const loginSchema = z.object({
  email: z.string().trim().email("Ingresá un email válido"),
  password: z.string().min(1, "La contraseña es obligatoria"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { control, handleSubmit, formState: { isSubmitting } } = useForm<LoginFormValues>({
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
    <Center mih="100vh" p="md" bg="gray.0">
      <Card withBorder radius="md" padding="lg" w="100%" maw={420}>
        <Stack gap="md">
          <div>
            <Title order={3}>Dinamic Attendance</Title>
            <Text c="dimmed" size="sm">
              Iniciá sesión para acceder al panel administrativo.
            </Text>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <FormSection>
              <Stack gap="md">
                <FormErrorAlert message={errorMessage} />
                <RHFTextInput
                  control={control}
                  name="email"
                  label="Email"
                  type="email"
                  required
                />
                <RHFTextInput
                  control={control}
                  name="password"
                  label="Contraseña"
                  type="password"
                  required
                />
                <Button type="submit" loading={isSubmitting}>
                  Iniciar sesión
                </Button>
              </Stack>
            </FormSection>
          </form>
        </Stack>
      </Card>
    </Center>
  );
}
