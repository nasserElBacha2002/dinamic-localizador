import { Alert, Box, Button, Group, Stack, Text, TextInput } from "@mantine/core";
import { useMemo, useState } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FilterLookupInput } from "../../design-system";
import { useCreateLocationZone, useLocationZones } from "../../hooks/useLocationZones";
import { getApiErrorMessage } from "../../utils/errors";
import { normalizeLocationZoneName } from "../../utils/normalize-location-zone-name";
import { shouldOfferLocationZoneCreate } from "./employee-location-zone-select-logic";

const NONE_VALUE = "__none__";

interface EmployeeLocationZoneSelectProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  canCreate?: boolean;
  disabled?: boolean;
  /** Keep an inactive zone visible when editing an existing assignment. */
  retainedZone?: { id: string; name: string; locality?: string | null } | null;
}

function zoneLabel(name: string, locality: string | null | undefined): string {
  if (locality && locality.trim()) {
    return `${name} — ${locality.trim()}`;
  }
  return name;
}

export function EmployeeLocationZoneSelect<T extends FieldValues>({
  control,
  name,
  label = "Zona de residencia",
  canCreate = false,
  disabled = false,
  retainedZone = null,
}: EmployeeLocationZoneSelectProps<T>) {
  const zonesQuery = useLocationZones({ includeInactive: false });
  const createMutation = useCreateLocationZone();

  const [inputValue, setInputValue] = useState("");
  const [pendingCreateName, setPendingCreateName] = useState<string | null>(null);
  const [pendingLocality, setPendingLocality] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const catalogFailed = zonesQuery.isError;
  const catalogLoading = zonesQuery.isPending;
  const canUseCatalog = !catalogFailed && !catalogLoading;

  const zones = useMemo(() => {
    if (!zonesQuery.data) {
      return [];
    }

    const items = [...zonesQuery.data];
    if (retainedZone && !items.some((zone) => zone.id === retainedZone.id)) {
      items.push({
        id: retainedZone.id,
        companyId: "",
        name: retainedZone.name,
        normalizedName: normalizeLocationZoneName(retainedZone.name),
        locality: retainedZone.locality ?? null,
        normalizedLocality: normalizeLocationZoneName(retainedZone.locality ?? ""),
        centroidLatitude: null,
        centroidLongitude: null,
        isActive: false,
        createdAt: "",
        updatedAt: "",
      });
    }

    return items.sort((a, b) => {
      const byName = a.name.localeCompare(b.name, "es");
      if (byName !== 0) {
        return byName;
      }
      return (a.locality ?? "").localeCompare(b.locality ?? "", "es");
    });
  }, [zonesQuery.data, retainedZone]);

  const localitySuggestions = useMemo(() => {
    const values = new Set<string>();
    for (const zone of zones) {
      if (zone.locality?.trim()) {
        values.add(zone.locality.trim());
      }
    }
    return [...values].sort((a, b) => a.localeCompare(b, "es"));
  }, [zones]);

  const filteredOptions = useMemo(() => {
    const query = normalizeLocationZoneName(inputValue);
    const matched = query
      ? zones.filter((zone) => {
          const haystack = normalizeLocationZoneName(`${zone.name} ${zone.locality ?? ""}`);
          return haystack.includes(query);
        })
      : zones;

    const zoneOptions = matched.map((zone) => ({
      value: zone.id,
      label: zoneLabel(zone.name, zone.locality),
      description: zone.isActive ? undefined : "Inactiva (asignación actual)",
    }));

    if (query) {
      return zoneOptions;
    }

    return [{ value: NONE_VALUE, label: "Sin especificar" }, ...zoneOptions];
  }, [zones, inputValue]);

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const selectedValue =
          field.value === null || field.value === undefined || field.value === ""
            ? NONE_VALUE
            : String(field.value);

        const selectedOption =
          selectedValue === NONE_VALUE
            ? { value: NONE_VALUE, label: "Sin especificar" }
            : filteredOptions.find((option) => option.value === selectedValue) ??
              (retainedZone && retainedZone.id === selectedValue
                ? {
                    value: retainedZone.id,
                    label: zoneLabel(retainedZone.name, retainedZone.locality),
                  }
                : null);

        const trimmedInput = inputValue.trim();
        const showCreate = shouldOfferLocationZoneCreate({
          input: trimmedInput,
          zoneLabels: zones.map((zone) => zone.name),
          canCreate,
          catalogReady: canUseCatalog,
          createPending: createMutation.isPending,
        });

        return (
          <Stack gap="xs">
            {catalogFailed ? (
              <Alert
                color="red"
                title="No se pudieron cargar las zonas"
                withCloseButton={false}
              >
                <Stack gap="xs">
                  <Text size="sm">{getApiErrorMessage(zonesQuery.error)}</Text>
                  <Button
                    size="xs"
                    variant="light"
                    onClick={() => {
                      void zonesQuery.refetch();
                    }}
                  >
                    Reintentar
                  </Button>
                </Stack>
              </Alert>
            ) : null}

            <FilterLookupInput
              label={label}
              value={selectedValue}
              onChange={(value) => {
                if (!value || value === NONE_VALUE) {
                  field.onChange(null);
                  return;
                }
                if (value === "__create__") {
                  return;
                }
                field.onChange(value);
              }}
              options={catalogFailed ? [] : filteredOptions}
              inputValue={inputValue}
              onInputChange={setInputValue}
              selectedOption={selectedOption}
              placeholder="Buscar o crear zona..."
              loading={catalogLoading}
              disabled={disabled || createMutation.isPending || catalogFailed}
              error={Boolean(fieldState.error) || Boolean(createError) || catalogFailed}
              description={
                fieldState.error?.message ??
                "Barrio / zona geográfica compartida con servicios (no es una dirección exacta)."
              }
              inputWrapperOrder={["label", "input", "description", "error"]}
              emptyMessage={
                catalogFailed
                  ? "Catálogo no disponible"
                  : showCreate
                    ? `No hay coincidencia exacta para “${trimmedInput}”`
                    : "Sin resultados"
              }
              createOption={
                showCreate
                  ? {
                      label: `+ Crear “${trimmedInput}”`,
                      onSelect: () => {
                        setPendingCreateName(trimmedInput);
                        setPendingLocality(localitySuggestions[0] ?? "");
                        setCreateError(null);
                      },
                    }
                  : undefined
              }
              maxOptions={20}
            />

            {pendingCreateName && canUseCatalog ? (
              <Box
                p="sm"
                style={{
                  border: "1px solid var(--mantine-color-gray-3)",
                  borderRadius: "var(--mantine-radius-md)",
                }}
              >
                <Stack gap="sm">
                  <Text size="sm">
                    Crear zona geográfica <strong>{pendingCreateName}</strong>
                  </Text>
                  <TextInput
                    label="Barrio / zona"
                    value={pendingCreateName}
                    onChange={(event) => setPendingCreateName(event.currentTarget.value)}
                    disabled={createMutation.isPending}
                  />
                  <TextInput
                    label="Localidad"
                    value={pendingLocality}
                    onChange={(event) => setPendingLocality(event.currentTarget.value)}
                    placeholder={
                      localitySuggestions.length > 0
                        ? `Ej. ${localitySuggestions[0]}`
                        : "Ej. CABA"
                    }
                    disabled={createMutation.isPending}
                    description="Reutilizá la misma localidad para evitar duplicados (CABA ≠ Córdoba)."
                  />
                  {createError ? (
                    <Text size="sm" c="red">
                      {createError}
                    </Text>
                  ) : null}
                  <Group gap="xs">
                    <Button
                      size="xs"
                      loading={createMutation.isPending}
                      onClick={() => {
                        void (async () => {
                          if (!pendingCreateName.trim()) {
                            return;
                          }
                          setCreateError(null);
                          try {
                            const created = await createMutation.mutateAsync({
                              name: pendingCreateName.trim(),
                              locality: pendingLocality.trim() || null,
                            });
                            field.onChange(created.id);
                            setInputValue("");
                            setPendingCreateName(null);
                            setPendingLocality("");
                          } catch (error) {
                            setCreateError(getApiErrorMessage(error));
                          }
                        })();
                      }}
                    >
                      Crear y seleccionar
                    </Button>
                    <Button
                      size="xs"
                      variant="default"
                      disabled={createMutation.isPending}
                      onClick={() => {
                        setPendingCreateName(null);
                        setPendingLocality("");
                        setCreateError(null);
                      }}
                    >
                      Cancelar
                    </Button>
                  </Group>
                </Stack>
              </Box>
            ) : null}
          </Stack>
        );
      }}
    />
  );
}
