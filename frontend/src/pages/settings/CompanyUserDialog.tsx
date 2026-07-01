import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  FormHelperText,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
import { useEffect, useMemo, useState } from "react";
import type { CompanyRole, CompanyUser, CreateCompanyUserInput } from "../../types/company-user";
import { companyRoleLabels } from "../../utils/labels";

const COMPANY_ROLES: CompanyRole[] = [
  "OWNER",
  "ADMIN",
  "HR",
  "SUPERVISOR",
  "OPERATOR",
  "READ_ONLY",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CompanyUserDialogProps {
  open: boolean;
  mode: "create" | "edit";
  initialUser?: CompanyUser | null;
  loading?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (
    input:
      | CreateCompanyUserInput
      | { role: CompanyRole; status: CompanyUser["membershipStatus"]; isDefault: boolean },
  ) => void;
}

export function CompanyUserDialog({
  open,
  mode,
  initialUser,
  loading = false,
  errorMessage,
  onClose,
  onSubmit,
}: CompanyUserDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CompanyRole>("ADMIN");
  const [status, setStatus] = useState<CompanyUser["membershipStatus"]>("ACTIVE");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    if (mode === "edit" && initialUser) {
      setName(initialUser.name);
      setEmail(initialUser.email);
      setRole(initialUser.companyRole);
      setStatus(initialUser.membershipStatus);
      setIsDefault(initialUser.isDefault);
      setTemporaryPassword("");
      return;
    }

    setName("");
    setEmail("");
    setRole("ADMIN");
    setStatus("ACTIVE");
    setTemporaryPassword("");
    setIsDefault(false);
  }, [open, mode, initialUser]);

  const validationErrors = useMemo(() => {
    if (mode === "create") {
      const errors: string[] = [];
      if (!email.trim()) {
        errors.push("El email es obligatorio.");
      } else if (!EMAIL_PATTERN.test(email.trim())) {
        errors.push("Ingresá un email válido.");
      }
      if (!name.trim()) {
        errors.push("El nombre es obligatorio.");
      }
      if (!temporaryPassword || temporaryPassword.length < 8) {
        errors.push("La contraseña temporal debe tener al menos 8 caracteres.");
      }
      return errors;
    }

    return [];
  }, [email, mode, name, temporaryPassword]);

  const isValid = mode === "create" ? validationErrors.length === 0 : Boolean(role && status);

  const handleSubmit = () => {
    if (!isValid || loading) {
      return;
    }

    if (mode === "create") {
      onSubmit({
        name: name.trim(),
        email: email.trim(),
        role,
        status,
        temporaryPassword,
        isDefault,
      });
      return;
    }

    onSubmit({ role, status, isDefault });
  };

  const handleClose = () => {
    setTemporaryPassword("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{mode === "create" ? "Agregar usuario" : "Editar usuario"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {mode === "create" ? (
            <>
              <TextField
                label="Email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                fullWidth
              />
              <TextField
                label="Nombre"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                fullWidth
              />
              <FormHelperText>
                Se usará solo si el usuario no existe todavía. Si el usuario ya existe, se agregará
                su acceso a esta empresa.
              </FormHelperText>
              <TextField
                label="Contraseña temporal"
                type="password"
                value={temporaryPassword}
                onChange={(event) => setTemporaryPassword(event.target.value)}
                required
                helperText="Obligatoria en el formulario. El backend la ignora si el usuario ya existe."
                fullWidth
              />
            </>
          ) : (
            <>
              <TextField label="Nombre" value={name} fullWidth disabled />
              <TextField label="Email" value={email} fullWidth disabled />
            </>
          )}

          <FormControl fullWidth>
            <InputLabel id="company-user-role-label">Rol en la empresa</InputLabel>
            <Select
              labelId="company-user-role-label"
              label="Rol en la empresa"
              value={role}
              onChange={(event) => setRole(event.target.value as CompanyRole)}
            >
              {COMPANY_ROLES.map((companyRole) => (
                <MenuItem key={companyRole} value={companyRole}>
                  {companyRoleLabels[companyRole]}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {mode === "edit" ? (
            <FormControl fullWidth>
              <InputLabel id="company-user-status-label">Estado</InputLabel>
              <Select
                labelId="company-user-status-label"
                label="Estado"
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as CompanyUser["membershipStatus"])
                }
              >
                <MenuItem value="ACTIVE">Activo</MenuItem>
                <MenuItem value="INACTIVE">Inactivo</MenuItem>
              </Select>
            </FormControl>
          ) : null}

          <FormControlLabel
            control={
              <Switch checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
            }
            label="Empresa predeterminada para este usuario"
          />

          {validationErrors.length > 0 ? (
            <FormHelperText error>{validationErrors.join(" ")}</FormHelperText>
          ) : null}
          {errorMessage ? <FormHelperText error>{errorMessage}</FormHelperText> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading || !isValid}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
