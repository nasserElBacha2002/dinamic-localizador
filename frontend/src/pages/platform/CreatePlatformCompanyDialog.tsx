import {
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  FormGroup,
  FormHelperText,
  Stack,
  TextField,
} from "@mui/material";
import { useMemo, useState } from "react";
import type { CreatePlatformCompanyInput } from "../../types/platform-company";

const DEFAULT_TIMEZONE = "America/Argentina/Buenos_Aires";

const MODULE_OPTIONS: NonNullable<CreatePlatformCompanyInput["modules"]> = [
  "attendance",
  "inventory_operations",
  "absences",
  "reports",
  "bot_simulator",
];

interface CreatePlatformCompanyDialogProps {
  open: boolean;
  loading?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (input: CreatePlatformCompanyInput) => void;
}

export function CreatePlatformCompanyDialog({
  open,
  loading = false,
  errorMessage,
  onClose,
  onSubmit,
}: CreatePlatformCompanyDialogProps) {
  const [name, setName] = useState("");
  const [defaultTimezone, setDefaultTimezone] = useState(DEFAULT_TIMEZONE);
  const [defaultRadiusMeters, setDefaultRadiusMeters] = useState("150");
  const [lateGraceMinutes, setLateGraceMinutes] = useState("15");
  const [earlyLeaveToleranceMinutes, setEarlyLeaveToleranceMinutes] = useState("15");
  const [requireCheckoutLocation, setRequireCheckoutLocation] = useState(true);
  const [allowManualAttendanceCorrections, setAllowManualAttendanceCorrections] = useState(true);
  const [modules, setModules] = useState<CreatePlatformCompanyInput["modules"]>([
    ...MODULE_OPTIONS,
  ]);
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerTemporaryPassword, setOwnerTemporaryPassword] = useState("");

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!name.trim()) errors.push("El nombre de la empresa es obligatorio.");
    if (!ownerName.trim()) errors.push("El nombre del owner es obligatorio.");
    if (!ownerEmail.trim()) errors.push("El email del owner es obligatorio.");
    if (!ownerTemporaryPassword || ownerTemporaryPassword.length < 8) {
      errors.push("La contraseña temporal del owner debe tener al menos 8 caracteres.");
    }
    return errors;
  }, [name, ownerEmail, ownerName, ownerTemporaryPassword]);

  const isValid = validationErrors.length === 0;

  const handleSubmit = () => {
    if (!isValid || loading) return;

    onSubmit({
      name: name.trim(),
      defaultTimezone: defaultTimezone.trim() || DEFAULT_TIMEZONE,
      settings: {
        operationTimezone: defaultTimezone.trim() || DEFAULT_TIMEZONE,
        defaultRadiusMeters: Number(defaultRadiusMeters),
        lateGraceMinutes: Number(lateGraceMinutes),
        earlyLeaveToleranceMinutes: Number(earlyLeaveToleranceMinutes),
        requireCheckoutLocation,
        allowManualAttendanceCorrections,
      },
      modules,
      owner: {
        name: ownerName.trim(),
        email: ownerEmail.trim(),
        temporaryPassword: ownerTemporaryPassword,
      },
    });
  };

  const handleClose = () => {
    setOwnerTemporaryPassword("");
    onClose();
  };

  return (
    <Dialog open={open} onClose={loading ? undefined : handleClose} fullWidth maxWidth="md">
      <DialogTitle>Crear empresa</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField label="Nombre de la empresa" value={name} onChange={(e) => setName(e.target.value)} required fullWidth />
          <TextField label="Zona horaria" value={defaultTimezone} onChange={(e) => setDefaultTimezone(e.target.value)} fullWidth />
          <TextField label="Radio predeterminado (m)" value={defaultRadiusMeters} onChange={(e) => setDefaultRadiusMeters(e.target.value)} fullWidth />
          <TextField label="Tolerancia de llegada (min)" value={lateGraceMinutes} onChange={(e) => setLateGraceMinutes(e.target.value)} fullWidth />
          <TextField label="Tolerancia de salida anticipada (min)" value={earlyLeaveToleranceMinutes} onChange={(e) => setEarlyLeaveToleranceMinutes(e.target.value)} fullWidth />
          <FormControlLabel control={<Checkbox checked={requireCheckoutLocation} onChange={(e) => setRequireCheckoutLocation(e.target.checked)} />} label="Requerir ubicación en checkout" />
          <FormControlLabel control={<Checkbox checked={allowManualAttendanceCorrections} onChange={(e) => setAllowManualAttendanceCorrections(e.target.checked)} />} label="Permitir correcciones manuales de asistencia" />
          <FormGroup>
            {MODULE_OPTIONS.map((moduleKey) => (
              <FormControlLabel
                key={moduleKey}
                control={
                  <Checkbox
                    checked={modules?.includes(moduleKey) ?? false}
                    onChange={(event) => {
                      setModules((current) => {
                        const next = new Set(current ?? []);
                        if (event.target.checked) next.add(moduleKey);
                        else next.delete(moduleKey);
                        return [...next];
                      });
                    }}
                  />
                }
                label={moduleKey}
              />
            ))}
          </FormGroup>
          <TextField label="Nombre del owner" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required fullWidth />
          <TextField label="Email del owner" type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} required fullWidth />
          <TextField label="Contraseña temporal del owner" type="password" value={ownerTemporaryPassword} onChange={(e) => setOwnerTemporaryPassword(e.target.value)} required fullWidth helperText="Se usa solo si el usuario no existe. No se mostrará nuevamente." />
          {validationErrors.length > 0 ? <FormHelperText error>{validationErrors.join(" ")}</FormHelperText> : null}
          {errorMessage ? <FormHelperText error>{errorMessage}</FormHelperText> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} disabled={loading}>Cancelar</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={loading || !isValid}>Crear empresa</Button>
      </DialogActions>
    </Dialog>
  );
}
