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

const DEFAULT_FORM_STATE = {
  name: "",
  defaultTimezone: DEFAULT_TIMEZONE,
  defaultRadiusMeters: "150",
  lateGraceMinutes: "15",
  earlyLeaveToleranceMinutes: "15",
  requireCheckoutLocation: true,
  allowManualAttendanceCorrections: true,
  modules: [...MODULE_OPTIONS] as CreatePlatformCompanyInput["modules"],
  ownerName: "",
  ownerEmail: "",
  ownerTemporaryPassword: "",
};

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
  const [name, setName] = useState(DEFAULT_FORM_STATE.name);
  const [defaultTimezone, setDefaultTimezone] = useState(DEFAULT_FORM_STATE.defaultTimezone);
  const [defaultRadiusMeters, setDefaultRadiusMeters] = useState(
    DEFAULT_FORM_STATE.defaultRadiusMeters,
  );
  const [lateGraceMinutes, setLateGraceMinutes] = useState(DEFAULT_FORM_STATE.lateGraceMinutes);
  const [earlyLeaveToleranceMinutes, setEarlyLeaveToleranceMinutes] = useState(
    DEFAULT_FORM_STATE.earlyLeaveToleranceMinutes,
  );
  const [requireCheckoutLocation, setRequireCheckoutLocation] = useState(
    DEFAULT_FORM_STATE.requireCheckoutLocation,
  );
  const [allowManualAttendanceCorrections, setAllowManualAttendanceCorrections] = useState(
    DEFAULT_FORM_STATE.allowManualAttendanceCorrections,
  );
  const [modules, setModules] = useState<CreatePlatformCompanyInput["modules"]>(
    DEFAULT_FORM_STATE.modules,
  );
  const [ownerName, setOwnerName] = useState(DEFAULT_FORM_STATE.ownerName);
  const [ownerEmail, setOwnerEmail] = useState(DEFAULT_FORM_STATE.ownerEmail);
  const [ownerTemporaryPassword, setOwnerTemporaryPassword] = useState(
    DEFAULT_FORM_STATE.ownerTemporaryPassword,
  );

  const resetForm = () => {
    setName(DEFAULT_FORM_STATE.name);
    setDefaultTimezone(DEFAULT_FORM_STATE.defaultTimezone);
    setDefaultRadiusMeters(DEFAULT_FORM_STATE.defaultRadiusMeters);
    setLateGraceMinutes(DEFAULT_FORM_STATE.lateGraceMinutes);
    setEarlyLeaveToleranceMinutes(DEFAULT_FORM_STATE.earlyLeaveToleranceMinutes);
    setRequireCheckoutLocation(DEFAULT_FORM_STATE.requireCheckoutLocation);
    setAllowManualAttendanceCorrections(DEFAULT_FORM_STATE.allowManualAttendanceCorrections);
    setModules([...DEFAULT_FORM_STATE.modules!]);
    setOwnerName(DEFAULT_FORM_STATE.ownerName);
    setOwnerEmail(DEFAULT_FORM_STATE.ownerEmail);
    setOwnerTemporaryPassword(DEFAULT_FORM_STATE.ownerTemporaryPassword);
  };

  const validationErrors = useMemo(() => {
    const errors: string[] = [];
    if (!name.trim()) {
      errors.push("El nombre de la empresa es obligatorio.");
    }
    if (!ownerName.trim()) {
      errors.push("El nombre del owner es obligatorio.");
    }
    if (!ownerEmail.trim()) {
      errors.push("El email del owner es obligatorio.");
    }
    if (!ownerTemporaryPassword || ownerTemporaryPassword.length < 8) {
      errors.push("La contraseña temporal del owner debe tener al menos 8 caracteres.");
    }

    const radius = Number(defaultRadiusMeters);
    if (!Number.isInteger(radius) || radius <= 0) {
      errors.push("El radio predeterminado debe ser un número entero positivo.");
    }

    const lateGrace = Number(lateGraceMinutes);
    if (!Number.isInteger(lateGrace) || lateGrace < 0) {
      errors.push("La tolerancia de llegada debe ser un número entero mayor o igual a 0.");
    }

    const earlyLeave = Number(earlyLeaveToleranceMinutes);
    if (!Number.isInteger(earlyLeave) || earlyLeave < 0) {
      errors.push(
        "La tolerancia de salida anticipada debe ser un número entero mayor o igual a 0.",
      );
    }

    return errors;
  }, [
    defaultRadiusMeters,
    earlyLeaveToleranceMinutes,
    lateGraceMinutes,
    name,
    ownerEmail,
    ownerName,
    ownerTemporaryPassword,
  ]);

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
    if (loading) return;
    resetForm();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : handleClose}
      fullWidth
      maxWidth="md"
      slotProps={{
        transition: {
          onExited: resetForm,
        },
      }}
    >
      <DialogTitle>Crear empresa</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Nombre de la empresa"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Zona horaria"
            value={defaultTimezone}
            onChange={(event) => setDefaultTimezone(event.target.value)}
            fullWidth
          />
          <TextField
            label="Radio predeterminado (m)"
            type="number"
            value={defaultRadiusMeters}
            onChange={(event) => setDefaultRadiusMeters(event.target.value)}
            inputProps={{ min: 1, step: 1 }}
            fullWidth
          />
          <TextField
            label="Tolerancia de llegada (min)"
            type="number"
            value={lateGraceMinutes}
            onChange={(event) => setLateGraceMinutes(event.target.value)}
            inputProps={{ min: 0, step: 1 }}
            fullWidth
          />
          <TextField
            label="Tolerancia de salida anticipada (min)"
            type="number"
            value={earlyLeaveToleranceMinutes}
            onChange={(event) => setEarlyLeaveToleranceMinutes(event.target.value)}
            inputProps={{ min: 0, step: 1 }}
            fullWidth
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={requireCheckoutLocation}
                onChange={(event) => setRequireCheckoutLocation(event.target.checked)}
              />
            }
            label="Requerir ubicación en checkout"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={allowManualAttendanceCorrections}
                onChange={(event) =>
                  setAllowManualAttendanceCorrections(event.target.checked)
                }
              />
            }
            label="Permitir correcciones manuales de asistencia"
          />
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
          <TextField
            label="Nombre del owner"
            value={ownerName}
            onChange={(event) => setOwnerName(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Email del owner"
            type="email"
            value={ownerEmail}
            onChange={(event) => setOwnerEmail(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Contraseña temporal del owner"
            type="password"
            value={ownerTemporaryPassword}
            onChange={(event) => setOwnerTemporaryPassword(event.target.value)}
            required
            fullWidth
            helperText="La contraseña se usará solo si el usuario owner no existe todavía. Si el usuario ya existe, el backend no cambiará su contraseña."
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
          Crear empresa
        </Button>
      </DialogActions>
    </Dialog>
  );
}
