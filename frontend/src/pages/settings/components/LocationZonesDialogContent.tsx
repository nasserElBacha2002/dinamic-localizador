import {
  Alert,
  Autocomplete,
  Badge,
  Button,
  Group,
  Progress,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useMemo, useState } from "react";
import { FormErrorAlert } from "../../../design-system";
import {
  useCreateLocationZone,
  useGeocodeLocationZone,
  useLocationZonesGeocodingSummary,
  useUpdateLocationZone,
} from "../../../hooks/useLocationZones";
import type { LocationZone } from "../../../types/location-zone";
import {
  localityCapitalHint,
  SUGGESTED_LOCALITY_LABELS,
} from "../../../utils/canonical-locality";
import { getApiErrorMessage } from "../../../utils/errors";
import { friendlyGeocodingErrorMessage } from "../../../utils/geocoding-error-message";
import {
  filterZonesByGeocodingStatus,
  geocodingStatusColor,
  geocodingStatusLabel,
  type GeocodingStatusFilter,
  summarizeActiveZoneGeocoding,
} from "../../../utils/location-zone-geocoding-ui";
import { buildLocationZoneEditPayload } from "./location-zone-edit-payload";

interface LocationZonesDialogContentProps {
  zones: LocationZone[];
  canUpdate: boolean;
}

const formatCoord = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }
  return value.toFixed(5);
};

const parseOptionalCoord = (raw: string): number | null | undefined => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
};

const STATUS_FILTER_OPTIONS: Array<{ value: GeocodingStatusFilter; label: string }> = [
  { value: "ALL", label: "Todos los estados" },
  { value: "RESOLVED", label: "Resuelta" },
  { value: "MANUAL", label: "Manual" },
  { value: "PENDING", label: "Pendiente" },
  { value: "FAILED", label: "Error" },
  { value: "NONE", label: "Sin estado" },
];

export function LocationZonesDialogContent({ zones, canUpdate }: LocationZonesDialogContentProps) {
  const createMutation = useCreateLocationZone();
  const updateMutation = useUpdateLocationZone();
  const geocodeMutation = useGeocodeLocationZone();
  const geocodingSummaryQuery = useLocationZonesGeocodingSummary(true);

  const [newName, setNewName] = useState("");
  const [newLocality, setNewLocality] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingLocality, setEditingLocality] = useState("");
  const [editingLat, setEditingLat] = useState("");
  const [editingLng, setEditingLng] = useState("");
  const [initialLat, setInitialLat] = useState<number | null>(null);
  const [initialLng, setInitialLng] = useState<number | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<LocationZone | null>(null);
  const [statusFilter, setStatusFilter] = useState<GeocodingStatusFilter>("ALL");

  const coverageFromApi = geocodingSummaryQuery.data;
  const coverage = coverageFromApi ?? summarizeActiveZoneGeocoding(zones);

  const sortedZones = useMemo(
    () => [...zones].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [zones],
  );

  const visibleZones = useMemo(
    () => filterZonesByGeocodingStatus(sortedZones, statusFilter),
    [sortedZones, statusFilter],
  );

  const disabled =
    !canUpdate ||
    createMutation.isPending ||
    updateMutation.isPending ||
    geocodeMutation.isPending;

  const beginEdit = (zone: LocationZone) => {
    setEditingId(zone.id);
    setEditingName(zone.name);
    setEditingLocality(zone.locality ?? "");
    setEditingLat(zone.centroidLatitude !== null ? String(zone.centroidLatitude) : "");
    setEditingLng(zone.centroidLongitude !== null ? String(zone.centroidLongitude) : "");
    setInitialLat(zone.centroidLatitude);
    setInitialLng(zone.centroidLongitude);
  };

  const clearEdit = () => {
    setEditingId(null);
    setEditingName("");
    setEditingLocality("");
    setEditingLat("");
    setEditingLng("");
    setInitialLat(null);
    setInitialLng(null);
  };

  const handleCreate = async () => {
    if (!canUpdate || !newName.trim()) {
      return;
    }

    setSubmitError(null);
    try {
      await createMutation.mutateAsync({
        name: newName.trim(),
        locality: newLocality.trim() ? newLocality.trim() : null,
      });
      setNewName("");
      setNewLocality("");
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleSaveEdit = async (zoneId: string) => {
    if (!canUpdate || !editingName.trim()) {
      return;
    }

    const lat = parseOptionalCoord(editingLat);
    const lng = parseOptionalCoord(editingLng);
    if (lat === undefined || lng === undefined) {
      setSubmitError("Latitud y longitud deben ser números válidos.");
      return;
    }
    const latEmpty = editingLat.trim() === "";
    const lngEmpty = editingLng.trim() === "";
    if (latEmpty !== lngEmpty) {
      setSubmitError("Latitud y longitud del centroide deben enviarse juntas.");
      return;
    }
    if (lat !== null && (lat < -90 || lat > 90)) {
      setSubmitError("La latitud del centroide debe estar entre -90 y 90.");
      return;
    }
    if (lng !== null && (lng < -180 || lng > 180)) {
      setSubmitError("La longitud del centroide debe estar entre -180 y 180.");
      return;
    }

    setSubmitError(null);
    try {
      const input = buildLocationZoneEditPayload({
        name: editingName.trim(),
        locality: editingLocality.trim() ? editingLocality.trim() : null,
        lat,
        lng,
        initialLat,
        initialLng,
      });
      await updateMutation.mutateAsync({ zoneId, input });
      clearEdit();
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleGeocode = async (zone: LocationZone) => {
    if (!canUpdate) {
      return;
    }
    const isManual =
      zone.geocodingStatus === "MANUAL" || zone.geocodingSource === "MANUAL";
    if (isManual) {
      const confirmed = window.confirm(
        "Esta zona tiene coordenadas manuales. Recalcular las reemplazará con el resultado de Google. ¿Continuar?",
      );
      if (!confirmed) {
        return;
      }
    }
    setSubmitError(null);
    try {
      await geocodeMutation.mutateAsync({ zoneId: zone.id, force: isManual });
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const applyActiveChange = async (zoneId: string, isActive: boolean) => {
    setSubmitError(null);
    try {
      await updateMutation.mutateAsync({
        zoneId,
        input: { isActive },
      });
      setPendingDeactivate(null);
    } catch (error) {
      setSubmitError(getApiErrorMessage(error));
    }
  };

  const handleToggleActive = (zone: LocationZone, nextActive: boolean) => {
    if (!canUpdate) {
      return;
    }

    if (!nextActive) {
      setPendingDeactivate(zone);
      return;
    }

    void applyActiveChange(zone.id, true);
  };

  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        Catálogo geográfico compartido (barrio + localidad) para colaboradores y servicios. No se
        almacenan direcciones exactas. Los centroides alimentan la proximidad de recomendaciones.
      </Text>

      <Stack gap={6}>
        <Text fw={600} size="sm">
          Cobertura geográfica
        </Text>
        <Text size="sm">
          {coverage.withCoordinates} de {coverage.total} zonas activas con coordenadas (
          {coverage.coveragePercent}%)
        </Text>
        <Progress
          value={coverage.total > 0 ? coverage.coveragePercent : 0}
          size="sm"
          aria-label="Cobertura geográfica de zonas activas"
        />
        <Text size="xs" c="dimmed">
          Resueltas automáticamente: {coverage.resolved} · Manuales: {coverage.manual} · Pendientes:{" "}
          {coverage.pending} · Con error: {coverage.failed}
        </Text>
        {coverageFromApi ? (
          <Text size="xs" c="dimmed">
            Localidades canónicas: {coverage.canonicalized} · Sin localidad:{" "}
            {coverage.missingLocality} · Desconocidas: {coverage.unknownLocality}
          </Text>
        ) : null}
        <Text size="xs" c="dimmed">
          Tener coordenadas indica cobertura, no precisión GPS del domicilio. Nombre = zona/barrio;
          localidad = contexto superior para desambiguar (p. ej. CABA, GBA, Córdoba).
        </Text>
      </Stack>

      <FormErrorAlert message={submitError} />

      {pendingDeactivate ? (
        <Alert color="yellow" title="Desactivar zona">
          <Stack gap="sm">
            <Text size="sm">
              Esta zona está asignada a {pendingDeactivate.assignedEmployeesCount ?? 0}{" "}
              colaborador{(pendingDeactivate.assignedEmployeesCount ?? 0) === 1 ? "" : "es"}.
              Los colaboradores conservarán la zona, pero no podrá asignarse a nuevos registros.
            </Text>
            <Group gap="xs">
              <Button
                color="red"
                size="xs"
                loading={updateMutation.isPending}
                onClick={() => void applyActiveChange(pendingDeactivate.id, false)}
              >
                Desactivar
              </Button>
              <Button
                size="xs"
                variant="default"
                disabled={updateMutation.isPending}
                onClick={() => setPendingDeactivate(null)}
              >
                Cancelar
              </Button>
            </Group>
          </Stack>
        </Alert>
      ) : null}

      {canUpdate ? (
        <Stack gap="xs">
          <Text fw={600} size="sm">
            Nueva zona
          </Text>
          <Group align="flex-end" grow>
            <TextInput
              label="Nombre"
              placeholder="Ej. Caballito"
              value={newName}
              onChange={(event) => setNewName(event.currentTarget.value)}
              disabled={disabled}
            />
            <Autocomplete
              label="Localidad"
              placeholder="Ej. CABA"
              data={[...SUGGESTED_LOCALITY_LABELS]}
              value={newLocality}
              onChange={setNewLocality}
              disabled={disabled}
              description={localityCapitalHint(newLocality) ?? undefined}
            />
            <Button onClick={() => void handleCreate()} loading={createMutation.isPending} disabled={disabled}>
              Agregar
            </Button>
          </Group>
        </Stack>
      ) : null}

      <Select
        label="Filtrar por estado de geocoding"
        data={STATUS_FILTER_OPTIONS}
        value={statusFilter}
        onChange={(value) => setStatusFilter((value as GeocodingStatusFilter) || "ALL")}
        allowDeselect={false}
      />

      <ScrollArea.Autosize mah={420}>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nombre</Table.Th>
              <Table.Th>Localidad</Table.Th>
              <Table.Th>Latitud</Table.Th>
              <Table.Th>Longitud</Table.Th>
              <Table.Th>Geocoding</Table.Th>
              <Table.Th>Asignados</Table.Th>
              <Table.Th>Activa</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {visibleZones.map((zone) => {
              const isEditing = editingId === zone.id;
              const isManual =
                zone.geocodingStatus === "MANUAL" || zone.geocodingSource === "MANUAL";
              const geocodeActionLabel =
                zone.geocodingStatus === "FAILED"
                  ? "Reintentar"
                  : isManual
                    ? "Recalcular"
                    : "Recalcular";

              return (
                <Table.Tr key={zone.id}>
                  <Table.Td>
                    {isEditing ? (
                      <TextInput
                        value={editingName}
                        onChange={(event) => setEditingName(event.currentTarget.value)}
                        disabled={disabled}
                      />
                    ) : (
                      zone.name
                    )}
                  </Table.Td>
                  <Table.Td>
                    {isEditing ? (
                      <Autocomplete
                        data={[...SUGGESTED_LOCALITY_LABELS]}
                        value={editingLocality}
                        onChange={setEditingLocality}
                        disabled={disabled}
                        description={localityCapitalHint(editingLocality) ?? undefined}
                      />
                    ) : (
                      zone.locality ?? "—"
                    )}
                  </Table.Td>
                  <Table.Td>
                    {isEditing ? (
                      <TextInput
                        value={editingLat}
                        placeholder="-34.62"
                        onChange={(event) => setEditingLat(event.currentTarget.value)}
                        disabled={disabled}
                      />
                    ) : (
                      formatCoord(zone.centroidLatitude)
                    )}
                  </Table.Td>
                  <Table.Td>
                    {isEditing ? (
                      <TextInput
                        value={editingLng}
                        placeholder="-58.44"
                        onChange={(event) => setEditingLng(event.currentTarget.value)}
                        disabled={disabled}
                      />
                    ) : (
                      formatCoord(zone.centroidLongitude)
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Stack gap={4}>
                      <Badge
                        size="sm"
                        color={geocodingStatusColor(zone.geocodingStatus)}
                        variant="light"
                      >
                        {geocodingStatusLabel(zone.geocodingStatus)}
                      </Badge>
                      {zone.geocodingStatus === "FAILED" ? (
                        <Text size="xs" c="dimmed" lineClamp={2}>
                          {friendlyGeocodingErrorMessage(zone.geocodingLastError)}
                        </Text>
                      ) : null}
                      {isManual && zone.geocodingStatus === "MANUAL" ? (
                        <Text size="xs" c="dimmed">
                          Coordenadas manuales
                        </Text>
                      ) : null}
                    </Stack>
                  </Table.Td>
                  <Table.Td>{zone.assignedEmployeesCount ?? 0}</Table.Td>
                  <Table.Td>
                    <Switch
                      checked={zone.isActive}
                      disabled={disabled}
                      onChange={(event) =>
                        handleToggleActive(zone, event.currentTarget.checked)
                      }
                    />
                  </Table.Td>
                  <Table.Td>
                    {canUpdate ? (
                      isEditing ? (
                        <Group gap="xs">
                          <Button
                            size="xs"
                            onClick={() => void handleSaveEdit(zone.id)}
                            loading={updateMutation.isPending}
                          >
                            Guardar
                          </Button>
                          <Button
                            size="xs"
                            variant="default"
                            disabled={disabled}
                            onClick={clearEdit}
                          >
                            Cancelar
                          </Button>
                        </Group>
                      ) : (
                        <Group gap="xs">
                          <Button
                            size="xs"
                            variant="light"
                            disabled={disabled}
                            onClick={() => beginEdit(zone)}
                          >
                            Editar
                          </Button>
                          <Button
                            size="xs"
                            variant="subtle"
                            disabled={disabled}
                            loading={
                              geocodeMutation.isPending &&
                              geocodeMutation.variables?.zoneId === zone.id
                            }
                            onClick={() => void handleGeocode(zone)}
                          >
                            {geocodeActionLabel}
                          </Button>
                        </Group>
                      )
                    ) : null}
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea.Autosize>
    </Stack>
  );
}
