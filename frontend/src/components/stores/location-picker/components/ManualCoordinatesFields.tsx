import { FormGrid } from "../../../../design-system";
import { NumberInput, Stack, Text, TextInput } from "@mantine/core";

type ManualCoordinatesFieldsProps = {
  address: string;
  neighborhood: string;
  locality: string;
  latitude: number;
  longitude: number;
  allowedRadiusMeters: number;
  onAddressChange: (value: string) => void;
  onNeighborhoodChange: (value: string) => void;
  onLocalityChange: (value: string) => void;
  onLatitudeChange: (value: number) => void;
  onLongitudeChange: (value: number) => void;
  onRadiusChange: (value: number) => void;
};

export function ManualCoordinatesFields({
  address,
  neighborhood,
  locality,
  latitude,
  longitude,
  allowedRadiusMeters,
  onAddressChange,
  onNeighborhoodChange,
  onLocalityChange,
  onLatitudeChange,
  onLongitudeChange,
  onRadiusChange,
}: ManualCoordinatesFieldsProps) {
  return (
    <Stack gap="md">
      <TextInput
        label="Dirección"
        value={address}
        onChange={(event) => onAddressChange(event.currentTarget.value)}
      />
      <FormGrid columns={{ base: 1, sm: 2 }}>
        <TextInput
          label="Barrio"
          value={neighborhood}
          onChange={(event) => onNeighborhoodChange(event.currentTarget.value)}
        />
        <TextInput
          label="Localidad"
          value={locality}
          onChange={(event) => onLocalityChange(event.currentTarget.value)}
        />
        <NumberInput
          label="Latitud"
          value={latitude}
          onChange={(value) => onLatitudeChange(typeof value === "number" ? value : latitude)}
          allowDecimal
          decimalScale={8}
        />
        <NumberInput
          label="Longitud"
          value={longitude}
          onChange={(value) => onLongitudeChange(typeof value === "number" ? value : longitude)}
          allowDecimal
          decimalScale={8}
        />
      </FormGrid>
      <NumberInput
        label="Radio permitido (metros)"
        value={allowedRadiusMeters}
        onChange={(value) => onRadiusChange(typeof value === "number" ? value : allowedRadiusMeters)}
        min={1}
        description="Se usa para validar la ubicación enviada por WhatsApp."
      />
      <Text size="sm" c="dimmed">
        Radio actual: {allowedRadiusMeters} m
      </Text>
    </Stack>
  );
}
