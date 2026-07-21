import { Alert, Button, Group } from "@mantine/core";

export interface ServicesListFiltersErrorBannerProps {
  facetsFailed: boolean;
  formatsFailed: boolean;
  onRetryFacets: () => void;
  onRetryFormats: () => void;
}

export function ServicesListFiltersErrorBanner({
  facetsFailed,
  formatsFailed,
  onRetryFacets,
  onRetryFormats,
}: ServicesListFiltersErrorBannerProps) {
  if (!facetsFailed && !formatsFailed) {
    return null;
  }

  return (
    <Alert
      color="yellow"
      variant="light"
      mb="md"
      title="No se pudieron cargar algunos filtros"
    >
      <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
        <span>
          {facetsFailed ? "Falló la carga de localidades y barrios. " : null}
          {formatsFailed ? "Falló la carga de formatos. " : null}
          El listado sigue disponible; podés reintentar.
        </span>
        <Group gap="xs">
          {facetsFailed ? (
            <Button size="xs" variant="light" onClick={onRetryFacets}>
              Reintentar localidades
            </Button>
          ) : null}
          {formatsFailed ? (
            <Button size="xs" variant="light" onClick={onRetryFormats}>
              Reintentar formatos
            </Button>
          ) : null}
        </Group>
      </Group>
    </Alert>
  );
}
