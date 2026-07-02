import { useMemo } from "react";
import { FilterLookupInput } from "../../design-system/filters/FilterLookupInput";
import { CREATE_OPTION_ID, type SearchAutocompleteOption } from "../../types/search-autocomplete";

interface SearchAutocompleteProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: SearchAutocompleteOption[];
  inputValue: string;
  onInputChange: (value: string) => void;
  selectedOption?: SearchAutocompleteOption | null;
  loading?: boolean;
  hasSearched?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  noOptionsText?: string;
  loadingText?: string;
  createOption?: {
    getLabel: (inputValue: string) => string;
    getDescription?: (inputValue: string) => string;
    onSelect: (inputValue: string) => void;
  };
}

function isCreateOption(option: SearchAutocompleteOption): boolean {
  return option.id === CREATE_OPTION_ID || option.isCreateAction === true;
}

export function SearchAutocomplete({
  label,
  value,
  onChange,
  options,
  inputValue,
  onInputChange,
  selectedOption = null,
  loading = false,
  hasSearched = false,
  error = false,
  helperText,
  disabled = false,
  required = false,
  placeholder = "Escribí para buscar...",
  noOptionsText = "Sin resultados",
  loadingText = "Buscando...",
  createOption,
}: SearchAutocompleteProps) {
  const trimmedInput = inputValue.trim();

  const lookupOptions = useMemo(() => {
    if (!createOption || !trimmedInput || loading || !hasSearched || options.length > 0) {
      return options
        .filter((option) => !isCreateOption(option))
        .map((option) => ({
          value: option.id,
          label: option.label,
          description: option.description,
          disabled: option.disabled,
        }));
    }

    return [];
  }, [createOption, hasSearched, loading, options, trimmedInput]);

  const lookupCreateOption = useMemo(() => {
    if (!createOption || !trimmedInput || loading || !hasSearched || options.length > 0) {
      return undefined;
    }

    return {
      label: createOption.getLabel(trimmedInput),
      description: createOption.getDescription?.(trimmedInput),
      onSelect: () => createOption.onSelect(trimmedInput),
    };
  }, [createOption, hasSearched, loading, options.length, trimmedInput]);

  const mappedSelectedOption = useMemo(() => {
    if (!selectedOption) {
      return null;
    }

    return {
      value: selectedOption.id,
      label: selectedOption.label,
      description: selectedOption.description,
      disabled: selectedOption.disabled,
    };
  }, [selectedOption]);

  return (
    <FilterLookupInput
      label={label}
      value={value}
      onChange={onChange}
      options={lookupOptions}
      inputValue={inputValue}
      onInputChange={onInputChange}
      selectedOption={mappedSelectedOption}
      loading={loading}
      disabled={disabled}
      required={required}
      error={error}
      description={helperText}
      placeholder={placeholder}
      emptyMessage={noOptionsText}
      loadingMessage={loadingText}
      createOption={lookupCreateOption}
    />
  );
}
