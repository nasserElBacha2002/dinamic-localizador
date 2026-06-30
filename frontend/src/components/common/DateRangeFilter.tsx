import {
  Box,
  Button,
  Divider,
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useId, useMemo, useState, type MouseEvent } from "react";
import type { DateRangeMode, DateRangePresetKey, DateRangeValue } from "../../types/date-range";
import {
  clearDateRangeValue,
  formatDateInputDisplay,
  formatDateRangeDisplay,
  getDateRangePresetLabel,
  getDefaultPresetsForMode,
  normalizeDateRangePresets,
  resolveDateRangePreset,
  validateCustomDateRange,
} from "../../utils/date-range";
import { DateRangeCalendar } from "./DateRangeCalendar";

type DraftCustomRange = {
  from: string | null;
  to: string | null;
};

function getDraftFromValue(value: DateRangeValue): DraftCustomRange {
  if (value.preset === "custom") {
    return { from: value.from, to: value.to };
  }

  return { from: null, to: null };
}

export type DateRangeFilterProps = {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  mode?: DateRangeMode;
  label?: string;
  disabled?: boolean;
  allowCustomRange?: boolean;
  defaultValue?: DateRangeValue;
  presets?: DateRangePresetKey[];
  size?: "small" | "medium";
  showClear?: boolean;
};

export function DateRangeFilter({
  value,
  onChange,
  mode = "past",
  label = "Fecha",
  disabled = false,
  allowCustomRange = true,
  defaultValue,
  presets,
  size = "medium",
  showClear = true,
}: DateRangeFilterProps) {
  const id = useId();
  const inputId = `${id}-input`;
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [customPanelOpen, setCustomPanelOpen] = useState(false);
  const [draftCustomRange, setDraftCustomRange] = useState<DraftCustomRange>(() => getDraftFromValue(value));
  const [calendarResetKey, setCalendarResetKey] = useState(0);
  const [applyAttempted, setApplyAttempted] = useState(false);

  const availablePresets = useMemo(
    () => normalizeDateRangePresets(presets ?? getDefaultPresetsForMode(mode), allowCustomRange),
    [allowCustomRange, mode, presets],
  );

  const presetOptions = useMemo(
    () => availablePresets.filter((preset) => preset !== "custom"),
    [availablePresets],
  );

  const open = Boolean(anchorEl);
  const displayValue = formatDateRangeDisplay(value);
  const draftValidation = validateCustomDateRange(draftCustomRange.from, draftCustomRange.to);
  const draftValidationMessage =
    draftValidation.rangeError ?? draftValidation.fromError ?? draftValidation.toError ?? null;

  const resetDraftFromValue = (nextValue: DateRangeValue) => {
    setDraftCustomRange(getDraftFromValue(nextValue));
    setApplyAttempted(false);
  };

  const handleOpen = (event: MouseEvent<HTMLElement>) => {
    if (disabled) {
      return;
    }

    setAnchorEl(event.currentTarget);
    setCustomPanelOpen(value.preset === "custom");
    resetDraftFromValue(value);
    setCalendarResetKey((current) => current + 1);
  };

  const handleClose = () => {
    resetDraftFromValue(value);
    setCustomPanelOpen(false);
    setAnchorEl(null);
  };

  const handlePresetSelect = (preset: DateRangePresetKey) => {
    if (preset === "custom") {
      setCustomPanelOpen(true);
      resetDraftFromValue(value);
      setCalendarResetKey((current) => current + 1);
      return;
    }

    onChange(resolveDateRangePreset(preset));
    setCustomPanelOpen(false);
    setApplyAttempted(false);
    setAnchorEl(null);
  };

  const handleDraftChange = (from: string | null, to: string | null) => {
    setDraftCustomRange({ from, to });
    setApplyAttempted(false);
  };

  const handleApplyCustomRange = () => {
    setApplyAttempted(true);
    if (!draftValidation.isValid) {
      return;
    }

    onChange({
      preset: "custom",
      from: draftCustomRange.from,
      to: draftCustomRange.to,
    });
    setCustomPanelOpen(false);
    setApplyAttempted(false);
    setAnchorEl(null);
  };

  const handleCancelCustomRange = () => {
    resetDraftFromValue(value);
    setCustomPanelOpen(value.preset === "custom");
    setAnchorEl(null);
  };

  const handleClear = () => {
    onChange(clearDateRangeValue(defaultValue));
    setCustomPanelOpen(false);
    resetDraftFromValue(clearDateRangeValue(defaultValue));
    setAnchorEl(null);
  };

  return (
    <Stack direction="row" spacing={1} alignItems="flex-start">
      <TextField
        id={inputId}
        label={label}
        value={displayValue}
        onClick={handleOpen}
        fullWidth
        size={size}
        disabled={disabled}
        slotProps={{
          input: {
            readOnly: true,
            sx: { cursor: disabled ? "not-allowed" : "pointer" },
          },
          inputLabel: { shrink: true },
        }}
      />

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: {
            sx: { width: anchorEl?.clientWidth ?? 320, maxWidth: "100vw", p: 1 },
          },
        }}
      >
        <List dense disablePadding>
          {presetOptions.map((preset) => (
            <ListItemButton
              key={preset}
              selected={value.preset === preset}
              onClick={() => handlePresetSelect(preset)}
            >
              <ListItemText primary={getDateRangePresetLabel(preset)} />
            </ListItemButton>
          ))}
        </List>

        {allowCustomRange ? (
          <>
            <Divider sx={{ my: 0.5 }} />
            <List dense disablePadding>
              <ListItemButton
                selected={customPanelOpen || value.preset === "custom"}
                onClick={() => handlePresetSelect("custom")}
              >
                <ListItemText primary={getDateRangePresetLabel("custom")} />
              </ListItemButton>
            </List>

            {customPanelOpen ? (
              <Box sx={{ px: 1, pt: 1, pb: 0.5 }}>
                <Box sx={{ mb: 1.5 }}>
                  <Typography variant="caption" fontWeight={600} sx={{ display: "block", mb: 0.5 }}>
                    Desde / Hasta
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 1,
                      px: 1.5,
                      py: 1,
                      borderRadius: 1,
                      border: 1,
                      borderColor: "divider",
                      bgcolor: "background.default",
                    }}
                  >
                    <Typography variant="body2" sx={{ flex: 1, textAlign: "center" }}>
                      {draftCustomRange.from ? formatDateInputDisplay(draftCustomRange.from) : "Seleccionar"}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      →
                    </Typography>
                    <Typography variant="body2" sx={{ flex: 1, textAlign: "center" }}>
                      {draftCustomRange.to ? formatDateInputDisplay(draftCustomRange.to) : "Seleccionar"}
                    </Typography>
                  </Box>
                </Box>

                <DateRangeCalendar
                  key={calendarResetKey}
                  from={draftCustomRange.from}
                  to={draftCustomRange.to}
                  onChange={handleDraftChange}
                  disabled={disabled}
                />

                {applyAttempted && draftValidationMessage ? (
                  <Typography variant="caption" color="error" sx={{ display: "block", mt: 1 }}>
                    {draftValidationMessage}
                  </Typography>
                ) : null}

                <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ mt: 1.5 }}>
                  <Button size="small" onClick={handleCancelCustomRange} disabled={disabled}>
                    Cancelar
                  </Button>
                  <Button
                    size="small"
                    variant="contained"
                    onClick={handleApplyCustomRange}
                    disabled={disabled}
                  >
                    Aplicar
                  </Button>
                </Stack>
              </Box>
            ) : null}
          </>
        ) : null}
      </Popover>

      {showClear ? (
        <Button
          aria-label="Limpiar rango de fechas"
          onClick={handleClear}
          disabled={disabled}
          size="small"
          variant="text"
          sx={{ flexShrink: 0, minWidth: "auto", px: 1, mt: size === "small" ? 0.5 : 1 }}
        >
          Limpiar
        </Button>
      ) : null}
    </Stack>
  );
}
