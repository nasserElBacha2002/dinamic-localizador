import {
  Button,
  Divider,
  Group,
  Popover,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useId, useMemo, useState, type MouseEvent } from "react";
import { DateRangeCalendar } from "../../components/common/DateRangeCalendar";
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

export interface FilterDateRangeInputProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  mode?: DateRangeMode;
  label?: string;
  disabled?: boolean;
  allowCustomRange?: boolean;
  defaultValue?: DateRangeValue;
  presets?: DateRangePresetKey[];
  showClear?: boolean;
}

export function FilterDateRangeInput({
  value,
  onChange,
  mode = "past",
  label = "Fecha",
  disabled = false,
  allowCustomRange = true,
  defaultValue,
  presets,
  showClear = true,
}: FilterDateRangeInputProps) {
  const id = useId();
  const inputId = `${id}-input`;
  const [opened, setOpened] = useState(false);
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

  const displayValue = formatDateRangeDisplay(value);
  const draftValidation = validateCustomDateRange(draftCustomRange.from, draftCustomRange.to);
  const draftValidationMessage =
    draftValidation.rangeError ?? draftValidation.fromError ?? draftValidation.toError ?? null;

  const resetDraftFromValue = (nextValue: DateRangeValue) => {
    setDraftCustomRange(getDraftFromValue(nextValue));
    setApplyAttempted(false);
  };

  const handleOpen = () => {
    if (disabled) {
      return;
    }

    setOpened(true);
    setCustomPanelOpen(value.preset === "custom");
    resetDraftFromValue(value);
    setCalendarResetKey((current) => current + 1);
  };

  const handleClose = () => {
    resetDraftFromValue(value);
    setCustomPanelOpen(false);
    setOpened(false);
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
    setOpened(false);
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
    setOpened(false);
  };

  const handleCancelCustomRange = () => {
    resetDraftFromValue(value);
    setCustomPanelOpen(value.preset === "custom");
    setOpened(false);
  };

  const handleClear = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onChange(clearDateRangeValue(defaultValue));
    setCustomPanelOpen(false);
    resetDraftFromValue(clearDateRangeValue(defaultValue));
    setOpened(false);
  };

  return (
    <Group gap="xs" align="flex-end" wrap="nowrap">
      <Popover
        opened={opened}
        onChange={(nextOpened) => {
          if (!nextOpened) {
            handleClose();
            return;
          }
          handleOpen();
        }}
        position="bottom-start"
        width="target"
        withinPortal
      >
        <Popover.Target>
          <TextInput
            id={inputId}
            label={label}
            value={displayValue}
            readOnly
            disabled={disabled}
            onClick={handleOpen}
            style={{ flex: 1, cursor: disabled ? "not-allowed" : "pointer" }}
          />
        </Popover.Target>

        <Popover.Dropdown p="xs">
          <Stack gap={4}>
            {presetOptions.map((preset) => (
              <UnstyledButton
                key={preset}
                onClick={() => handlePresetSelect(preset)}
                px="sm"
                py={6}
                style={{
                  borderRadius: "var(--mantine-radius-sm)",
                  backgroundColor:
                    value.preset === preset ? "var(--mantine-color-blue-light)" : undefined,
                }}
              >
                <Text size="sm">{getDateRangePresetLabel(preset)}</Text>
              </UnstyledButton>
            ))}

            {allowCustomRange ? (
              <>
                <Divider my={4} />
                <UnstyledButton
                  onClick={() => handlePresetSelect("custom")}
                  px="sm"
                  py={6}
                  style={{
                    borderRadius: "var(--mantine-radius-sm)",
                    backgroundColor:
                      customPanelOpen || value.preset === "custom"
                        ? "var(--mantine-color-blue-light)"
                        : undefined,
                  }}
                >
                  <Text size="sm">{getDateRangePresetLabel("custom")}</Text>
                </UnstyledButton>

                {customPanelOpen ? (
                  <Stack gap="sm" px="xs" pt="xs">
                    <div>
                      <Text size="xs" fw={600} mb={4}>
                        Desde / Hasta
                      </Text>
                      <Group
                        justify="space-between"
                        gap="xs"
                        px="sm"
                        py="xs"
                        style={{
                          border: "1px solid var(--mantine-color-gray-4)",
                          borderRadius: "var(--mantine-radius-sm)",
                        }}
                      >
                        <Text size="sm" ta="center" style={{ flex: 1 }}>
                          {draftCustomRange.from
                            ? formatDateInputDisplay(draftCustomRange.from)
                            : "Seleccionar"}
                        </Text>
                        <Text size="sm" c="dimmed">
                          →
                        </Text>
                        <Text size="sm" ta="center" style={{ flex: 1 }}>
                          {draftCustomRange.to
                            ? formatDateInputDisplay(draftCustomRange.to)
                            : "Seleccionar"}
                        </Text>
                      </Group>
                    </div>

                    <DateRangeCalendar
                      key={calendarResetKey}
                      from={draftCustomRange.from}
                      to={draftCustomRange.to}
                      onChange={handleDraftChange}
                      disabled={disabled}
                    />

                    {applyAttempted && draftValidationMessage ? (
                      <Text size="xs" c="red">
                        {draftValidationMessage}
                      </Text>
                    ) : null}

                    <Group justify="flex-end" gap="xs">
                      <Button size="xs" variant="default" onClick={handleCancelCustomRange} disabled={disabled}>
                        Cancelar
                      </Button>
                      <Button size="xs" onClick={handleApplyCustomRange} disabled={disabled}>
                        Aplicar
                      </Button>
                    </Group>
                  </Stack>
                ) : null}
              </>
            ) : null}
          </Stack>
        </Popover.Dropdown>
      </Popover>

      {showClear ? (
        <Button
          aria-label="Limpiar rango de fechas"
          onClick={handleClear}
          disabled={disabled}
          variant="subtle"
          size="compact-sm"
        >
          Limpiar
        </Button>
      ) : null}
    </Group>
  );
}
