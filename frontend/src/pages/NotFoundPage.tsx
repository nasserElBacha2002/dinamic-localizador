import { Button, Stack, Text, Title } from "@mantine/core";
import { Link as RouterLink } from "react-router-dom";

export function NotFoundPage() {
  return (
    <Stack gap="md" align="flex-start">
      <Title order={2}>Página no encontrada</Title>
      <Text c="dimmed">La ruta solicitada no existe en el panel administrativo.</Text>
      <Button component={RouterLink} to="/">
        Volver al inicio
      </Button>
    </Stack>
  );
}
