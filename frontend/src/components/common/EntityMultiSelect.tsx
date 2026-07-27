import {
  CloseButton,
  Combobox,
  Group,
  Loader,
  Pill,
  PillsInput,
  Text,
  useCombobox,
} from "@mantine/core";
import { useCallback, useEffect, useId, useMemo, useRef } from "react";
import type { KeyboardEvent } from "react";

export interface EntityMultiSelectOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface EntityMultiSelectProps {
  label: string;
  value: string[];
  onChange: (value: string[]) => void;
  /** Options currently available in the dropdown (search results). */
  options: EntityMultiSelectOption[];
  /** Labels for selected IDs that may not be in `options` (e.g. hydrated remotely). */
  selectedOptions?: EntityMultiSelectOption[];
  inputValue: string;
  onInputChange: (value: string) => void;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  required?: boolean;
  error?: boolean | string;
  description?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  /** Confirm highlighted / exact match with comma. Default true. */
  allowCommaSelection?: boolean;
  maxVisibleChips?: number;
  maxDropdownOptions?: number;
  /** Accessible name for the selection summary. */
  selectionSummaryLabel?: string;
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();
}

export function EntityMultiSelect({
  label,
  value,
  onChange,
  options,
  selectedOptions = [],
  inputValue,
  onInputChange,
  placeholder = "Escribí para buscar...",
  loading = false,
  disabled = false,
  clearable = true,
  required = false,
  error = false,
  description,
  emptyMessage = "Sin resultados",
  loadingMessage = "Buscando...",
  allowCommaSelection = true,
  maxVisibleChips = 3,
  maxDropdownOptions = 10,
  selectionSummaryLabel = "seleccionados",
}: EntityMultiSelectProps) {
  const listboxId = useId();
  const fieldRef = useRef<HTMLInputElement>(null);
  const isComposingRef = useRef(false);
  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const selectedSet = useMemo(() => new Set(value), [value]);

  const labelById = useMemo(() => {
    const map = new Map<string, EntityMultiSelectOption>();
    for (const option of selectedOptions) {
      map.set(option.value, option);
    }
    for (const option of options) {
      map.set(option.value, option);
    }
    return map;
  }, [options, selectedOptions]);

  const chipOptions = useMemo(
    () =>
      value.map((id) => {
        const known = labelById.get(id);
        return known ?? { value: id, label: id };
      }),
    [labelById, value],
  );

  const visibleChips = chipOptions.slice(0, maxVisibleChips);
  const hiddenCount = Math.max(0, chipOptions.length - maxVisibleChips);

  const availableOptions = useMemo(
    () =>
      options
        .filter((option) => !selectedSet.has(option.value))
        .slice(0, maxDropdownOptions),
    [maxDropdownOptions, options, selectedSet],
  );

  const addValue = useCallback(
    (id: string) => {
      if (!id || selectedSet.has(id) || disabled) {
        return;
      }
      const option = labelById.get(id) ?? availableOptions.find((item) => item.value === id);
      if (option?.disabled) {
        return;
      }
      onChange([...value, id]);
      onInputChange("");
      combobox.openDropdown();
      requestAnimationFrame(() => fieldRef.current?.focus());
    },
    [
      availableOptions,
      combobox,
      disabled,
      labelById,
      onChange,
      onInputChange,
      selectedSet,
      value,
    ],
  );

  const removeValue = useCallback(
    (id: string) => {
      if (disabled) {
        return;
      }
      onChange(value.filter((item) => item !== id));
      requestAnimationFrame(() => fieldRef.current?.focus());
    },
    [disabled, onChange, value],
  );

  const clearAll = useCallback(() => {
    if (disabled || value.length === 0) {
      return;
    }
    onChange([]);
    onInputChange("");
    requestAnimationFrame(() => fieldRef.current?.focus());
  }, [disabled, onChange, onInputChange, value.length]);

  const tryConfirmFromSearch = useCallback((): boolean => {
    const highlighted = combobox.getSelectedOptionIndex();
    if (highlighted >= 0 && availableOptions[highlighted] && !availableOptions[highlighted].disabled) {
      addValue(availableOptions[highlighted].value);
      return true;
    }

    const trimmed = inputValue.trim();
    if (!trimmed) {
      return false;
    }

    const needle = normalizeSearch(trimmed);
    const exactMatches = availableOptions.filter(
      (option) => !option.disabled && normalizeSearch(option.label) === needle,
    );
    if (exactMatches.length === 1) {
      addValue(exactMatches[0].value);
      return true;
    }

    return false;
  }, [addValue, availableOptions, combobox, inputValue]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (isComposingRef.current || event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Escape") {
      combobox.closeDropdown();
      return;
    }

    if (allowCommaSelection && event.key === ",") {
      event.preventDefault();
      tryConfirmFromSearch();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      tryConfirmFromSearch();
      return;
    }

    if (event.key === "Backspace" && inputValue === "" && value.length > 0) {
      event.preventDefault();
      removeValue(value[value.length - 1]);
    }
  };

  useEffect(() => {
    if (combobox.dropdownOpened) {
      combobox.selectFirstOption();
    }
  }, [availableOptions, combobox, combobox.dropdownOpened, inputValue]);

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(optionValue) => {
        addValue(optionValue);
      }}
    >
      <Combobox.DropdownTarget>
        <PillsInput
          label={label}
          description={description}
          error={error}
          required={required}
          disabled={disabled}
          rightSection={
            loading ? (
              <Loader size={16} />
            ) : clearable && value.length > 0 && !disabled ? (
              <CloseButton
                size="sm"
                onMouseDown={(event) => event.preventDefault()}
                onClick={clearAll}
                aria-label="Limpiar selección"
              />
            ) : null
          }
          onClick={() => {
            if (!disabled) {
              combobox.openDropdown();
            }
          }}
        >
          <Pill.Group>
            {visibleChips.map((chip) => (
              <Pill
                key={chip.value}
                withRemoveButton={!disabled && !chip.disabled}
                disabled={disabled || chip.disabled}
                onRemove={() => removeValue(chip.value)}
                removeButtonProps={{
                  "aria-label": `Quitar ${chip.label}`,
                }}
              >
                {chip.label}
              </Pill>
            ))}
            {hiddenCount > 0 ? (
              <Pill disabled aria-label={`Y ${hiddenCount} más`}>
                +{hiddenCount}
              </Pill>
            ) : null}
            <Combobox.EventsTarget>
              <PillsInput.Field
                ref={fieldRef}
                value={inputValue}
                placeholder={value.length === 0 ? placeholder : "Agregar..."}
                disabled={disabled}
                onChange={(event) => {
                  onInputChange(event.currentTarget.value);
                  combobox.openDropdown();
                  combobox.updateSelectedOptionIndex();
                }}
                onFocus={() => combobox.openDropdown()}
                onBlur={() => combobox.closeDropdown()}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => {
                  isComposingRef.current = true;
                }}
                onCompositionEnd={() => {
                  isComposingRef.current = false;
                }}
                aria-controls={listboxId}
                aria-expanded={combobox.dropdownOpened}
                role="combobox"
                aria-autocomplete="list"
              />
            </Combobox.EventsTarget>
          </Pill.Group>
        </PillsInput>
      </Combobox.DropdownTarget>

      <Combobox.Dropdown>
        <Combobox.Options id={listboxId} aria-label={label}>
          {loading ? (
            <Combobox.Empty>{loadingMessage}</Combobox.Empty>
          ) : availableOptions.length === 0 ? (
            <Combobox.Empty>{emptyMessage}</Combobox.Empty>
          ) : (
            availableOptions.map((option, index) => (
              <Combobox.Option
                value={option.value}
                key={option.value}
                id={`${listboxId}-option-${index}`}
                disabled={option.disabled}
                active={selectedSet.has(option.value)}
                aria-selected={selectedSet.has(option.value)}
              >
                <Group gap={6} wrap="nowrap">
                  <div>
                    <Text size="sm">{option.label}</Text>
                    {option.description ? (
                      <Text size="xs" c="dimmed">
                        {option.description}
                      </Text>
                    ) : null}
                  </div>
                </Group>
              </Combobox.Option>
            ))
          )}
        </Combobox.Options>
      </Combobox.Dropdown>

      <Text size="xs" c="dimmed" mt={4} aria-live="polite">
        {value.length} {selectionSummaryLabel}
      </Text>
    </Combobox>
  );
}
