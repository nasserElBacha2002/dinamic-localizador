import {
  Box,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Typography,
  type SelectChangeEvent,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useCompany } from "../../hooks/useCompany";

export function CompanySelector({ compact = false }: { compact?: boolean }) {
  const { companies, activeCompany, selectCompany } = useCompany();

  if (companies.length <= 1) {
    if (!activeCompany) {
      return null;
    }

    return (
      <Typography variant={compact ? "body2" : "subtitle2"} color="inherit">
        {activeCompany.companyName}
      </Typography>
    );
  }

  const handleChange = (event: SelectChangeEvent<string>) => {
    selectCompany(event.target.value);
  };

  return (
    <Stack direction="row" spacing={1} alignItems="center">
      {!compact ? (
        <Typography variant="body2" color="inherit">
          Empresa
        </Typography>
      ) : null}
      <FormControl size="small" sx={{ minWidth: compact ? 160 : 220 }}>
        <InputLabel id="active-company-label">Empresa activa</InputLabel>
        <Select
          labelId="active-company-label"
          label="Empresa activa"
          value={activeCompany?.companyId ?? ""}
          onChange={handleChange}
        >
          {companies.map((company) => (
            <MenuItem key={company.companyId} value={company.companyId}>
              {company.companyName}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Stack>
  );
}

export function CompanySelectionPage() {
  const { companies, selectCompany } = useCompany();
  const navigate = useNavigate();

  return (
    <Box sx={{ maxWidth: 480, mx: "auto", mt: 8, px: 2 }}>
      <Typography variant="h5" gutterBottom>
        Seleccioná una empresa
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        Tu usuario pertenece a más de una empresa. Elegí con cuál querés operar.
      </Typography>
      <Stack spacing={1}>
        {companies.map((company) => (
          <Box
            key={company.companyId}
            component="button"
            onClick={() => {
              selectCompany(company.companyId);
              navigate("/");
            }}
            sx={{
              textAlign: "left",
              border: 1,
              borderColor: "divider",
              borderRadius: 1,
              p: 2,
              cursor: "pointer",
              background: "background.paper",
            }}
          >
            <Typography variant="subtitle1">{company.companyName}</Typography>
            <Typography variant="body2" color="text.secondary">
              Rol: {company.role}
            </Typography>
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
