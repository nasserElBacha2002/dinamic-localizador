import { Card, CardContent, Grid, TextField, Typography } from "@mui/material";

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
    <Card
      variant="outlined"
      sx={{
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <CardContent sx={{ flex: 1 }}>
        <Typography variant="subtitle2" gutterBottom>
          Ubicación manual
        </Typography>
        <Grid container spacing={2}>
          <Grid size={12}>
            <TextField
              label="Dirección"
              fullWidth
              value={address}
              onChange={(event) => onAddressChange(event.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Barrio"
              fullWidth
              value={neighborhood}
              onChange={(event) => onNeighborhoodChange(event.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Localidad"
              fullWidth
              value={locality}
              onChange={(event) => onLocalityChange(event.target.value)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Latitud"
              type="number"
              fullWidth
              inputProps={{ step: "any" }}
              value={latitude}
              onChange={(event) => onLatitudeChange(Number(event.target.value))}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Longitud"
              type="number"
              fullWidth
              inputProps={{ step: "any" }}
              value={longitude}
              onChange={(event) => onLongitudeChange(Number(event.target.value))}
            />
          </Grid>
          <Grid size={12}>
            <TextField
              label="Radio permitido (metros)"
              type="number"
              fullWidth
              value={allowedRadiusMeters}
              onChange={(event) => onRadiusChange(Number(event.target.value))}
            />
          </Grid>
        </Grid>
      </CardContent>
    </Card>
  );
}
