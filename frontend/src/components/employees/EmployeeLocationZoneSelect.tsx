import { Alert, Button, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { FilterLookupInput } from "../../design-system";
import { useLocationZones } from "../../hooks/useLocationZones";
import { getApiErrorMessage } from "../../utils/errors";

const NONE_VALUE = "__none__";

interface EmployeeLocationZoneSelectProps<T extends FieldValues> {
  control: Control<T>;
  name: FieldPath<T>;
  label?: string;
  disabled?: boolean;
  /** Keep an inactive zone visible when editing an existing assignment. */
  retainedZone?: { id: string; name: string; locality?: string | null } | null;
}

function zoneLabel(name: string, locality: string | null | undefined): string {
  if (locality && locality.trim()) {
    return `${name} (${locality.trim()})`;
  }
  return name;
}

export function EmployeeLocationZoneSelect<T extends FieldValues>({
  control,
  name,
  label = "Zona de residencia",
  disabled = false,
  retainedZone = null,
}: EmployeeLocationZoneSelectProps<T>) {
  const zonesQuery = useLocationZones({ includeInactive: false });
  const [inputValue, setInputValue] = useState("");

  const catalogFailed = zonesQuery.isError;
  const catalogLoading = zonesQuery.isPending;

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
        normalizedName: retainedZone.name.toLowerCase(),
        locality: retainedZone.locality ?? null,
        normalizedLocality: (retainedZone.locality ?? "").toLowerCase(),
        centroidLatitude: null,
        centroidLongitude: null,
        isActive: false,
        createdAt: "",
        updatedAt: "",
      });
    }

    return items.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [zonesQuery.data, retainedZone]);

  const filteredOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    const matched = query
      ? zones.filter((zone) => {
          const haystack = `${zone.name} ${zone.locality ?? ""}`.toLowerCase();
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

        return (
          <Stack gap="xs">
            <FilterLookupInput
              label={label}
              value={selectedValue}
              onChange={(value) => {
                if (!value || value === NONE_VALUE) {
                  field.onChange(null);
                  return;
                }
                field.onChange(value);
              }}
              options={catalogFailed ? [] : filteredOptions}
              inputValue={inputValue}
              onInputChange={setInputValue}
              selectedOption={selectedOption}
              placeholder="Buscar o seleccionar zona..."
              loading={catalogLoading}
              disabled={disabled || catalogFailed}
              error={Boolean(fieldState.error) || catalogFailed}
              description={
                fieldState.error?.message ??
                "Zona aproximada de residencia (no es una dirección exacta)."
              }
              emptyMessage={catalogFailed ? "Catálogo no disponible" : "Sin resultados"}
              maxOptions={20}
            />

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
          </Stack>
        );
      }}
    />
  );
}
