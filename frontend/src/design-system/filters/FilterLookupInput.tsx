import {
  Combobox,
  Group,
  InputBase,
  Loader,
  Text,
  useCombobox,
} from "@mantine/core";
import { useMemo } from "react";

export interface FilterLookupOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface FilterLookupCreateOption {
  label: string;
  description?: string;
  onSelect: () => void;
}

export interface FilterLookupInputProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: FilterLookupOption[];
  inputValue: string;
  onInputChange: (value: string) => void;
  selectedOption?: FilterLookupOption | null;
  placeholder?: string;
  loading?: boolean;
  disabled?: boolean;
  clearable?: boolean;
  required?: boolean;
  error?: boolean;
  description?: string;
  emptyMessage?: string;
  loadingMessage?: string;
  createOption?: FilterLookupCreateOption;
  /** Maximum number of options rendered in the dropdown. */
  maxOptions?: number;
}

export function FilterLookupInput({
  label,
  value,
  onChange,
  options,
  inputValue,
  onInputChange,
  selectedOption = null,
  placeholder = "Escribí para buscar...",
  loading = false,
  disabled = false,
  required = false,
  error = false,
  description,
  emptyMessage = "Sin resultados",
  loadingMessage = "Buscando...",
  createOption,
  maxOptions = 10,
}: FilterLookupInputProps) {
  const combobox = useCombobox({
    onDropdownClose: () => {
      combobox.resetSelectedOption();
    },
  });

  const displayedOptions = useMemo(() => {
    const items = [...options];

    if (createOption && inputValue.trim() && !loading) {
      items.push({
        value: "__create__",
        label: createOption.label,
        description: createOption.description,
      });
    }

    return items.slice(0, maxOptions);
  }, [createOption, inputValue, loading, maxOptions, options]);

  const displayValue = useMemo(() => {
    if (combobox.dropdownOpened) {
      return inputValue;
    }

    if (value) {
      const fromOptions = options.find((option) => option.value === value);
      if (fromOptions) {
        return fromOptions.label;
      }

      if (selectedOption?.value === value) {
        return selectedOption.label;
      }
    }

    return inputValue;
  }, [combobox.dropdownOpened, inputValue, options, selectedOption, value]);

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={(optionValue) => {
        if (optionValue === "__create__") {
          createOption?.onSelect();
          combobox.closeDropdown();
          return;
        }

        onChange(optionValue);
        const option = displayedOptions.find((item) => item.value === optionValue);
        onInputChange(option?.label ?? "");
        combobox.closeDropdown();
      }}
    >
      <Combobox.Target>
        <InputBase
          label={label}
          required={required}
          disabled={disabled}
          error={error || undefined}
          description={description}
          placeholder={placeholder}
          value={displayValue}
          rightSection={loading ? <Loader size={16} /> : <Combobox.Chevron />}
          rightSectionPointerEvents="none"
          onClick={() => {
            if (!disabled) {
              combobox.openDropdown();
            }
          }}
          onFocus={() => {
            if (!disabled) {
              combobox.openDropdown();
            }
          }}
          onChange={(event) => {
            onInputChange(event.currentTarget.value);
            if (!value) {
              combobox.openDropdown();
              return;
            }

            onChange(null);
            combobox.openDropdown();
          }}
          onBlur={() => {
            combobox.closeDropdown();
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options mah={360} style={{ overflowY: "auto" }}>
          {loading ? (
            <Combobox.Empty>{loadingMessage}</Combobox.Empty>
          ) : displayedOptions.length === 0 ? (
            <Combobox.Empty>{emptyMessage}</Combobox.Empty>
          ) : (
            displayedOptions.map((option) => (
              <Combobox.Option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                <Group gap="xs" wrap="nowrap">
                  {option.value === "__create__" ? (
                    <Text c="blue" fw={600}>
                      +
                    </Text>
                  ) : null}
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
    </Combobox>
  );
}
