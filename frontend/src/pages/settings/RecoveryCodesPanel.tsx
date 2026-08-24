import { Button, CopyButton, Group, Stack, Text } from "@mantine/core";

export function RecoveryCodesPanel({
  codes,
  onConfirmSaved,
  confirmLabel = "Ya guardé los códigos",
}: {
  codes: string[];
  onConfirmSaved: () => void;
  confirmLabel?: string;
}) {
  const download = () => {
    const blob = new Blob([codes.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "dinamic-codigos-recuperacion.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Stack gap="md">
      <Text size="sm">
        Guardá estos códigos en un lugar seguro. Cada uno se usa una sola vez. No se van a volver a
        mostrar.
      </Text>
      <Stack gap={4}>
        {codes.map((code) => (
          <Text key={code} ff="monospace" size="sm">
            {code}
          </Text>
        ))}
      </Stack>
      <Group>
        <CopyButton value={codes.join("\n")}>
          {({ copied, copy }) => (
            <Button variant="light" onClick={copy}>
              {copied ? "Copiados" : "Copiar"}
            </Button>
          )}
        </CopyButton>
        <Button variant="light" onClick={download}>
          Descargar .txt
        </Button>
      </Group>
      <Button onClick={onConfirmSaved}>{confirmLabel}</Button>
    </Stack>
  );
}
