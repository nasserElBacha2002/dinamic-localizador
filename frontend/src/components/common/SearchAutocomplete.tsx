import {
  Autocomplete,
  Box,
  CircularProgress,
  ListItemText,
  TextField,
} from "@mui/material";
import { useMemo } from "react";
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

  const displayedOptions = useMemo(() => {
    if (!createOption || !trimmedInput || loading || !hasSearched || options.length > 0) {
      return options;
    }

    return [
      {
        id: CREATE_OPTION_ID,
        label: createOption.getLabel(trimmedInput),
        description: createOption.getDescription?.(trimmedInput),
        isCreateAction: true,
      },
    ];
  }, [createOption, hasSearched, loading, options, trimmedInput]);

  const autocompleteValue = useMemo(() => {
    if (!value) {
      return null;
    }

    return (
      displayedOptions.find((option) => option.id === value)
      ?? (selectedOption?.id === value ? selectedOption : null)
    );
  }, [displayedOptions, selectedOption, value]);

  return (
    <Autocomplete
      fullWidth
      disabled={disabled}
      loading={loading}
      value={autocompleteValue}
      inputValue={inputValue}
      options={displayedOptions}
      filterOptions={(items) => items}
      getOptionLabel={(option) => option.label}
      isOptionEqualToValue={(option, current) => option.id === current.id}
      getOptionDisabled={(option) => Boolean(option.disabled)}
      noOptionsText={loading ? loadingText : noOptionsText}
      onInputChange={(_event, nextInputValue) => {
        onInputChange(nextInputValue);
      }}
      onChange={(_event, option) => {
        if (!option) {
          onChange(null);
          return;
        }

        if (isCreateOption(option)) {
          createOption?.onSelect(trimmedInput);
          return;
        }

        onChange(option.id);
      }}
      renderOption={(props, option) => {
        const { key, ...optionProps } = props;

        if (isCreateOption(option)) {
          return (
            <Box component="li" key={key} {...optionProps} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
              <Box
                sx={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  border: 1,
                  borderColor: "primary.main",
                  color: "primary.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 20,
                  lineHeight: 1,
                  flexShrink: 0,
                }}
              >
                +
              </Box>
              <ListItemText
                primary={option.label}
                secondary={option.description}
                primaryTypographyProps={{ color: "primary" }}
              />
            </Box>
          );
        }

        return (
          <Box component="li" key={key} {...optionProps}>
            <ListItemText
              primary={option.label}
              secondary={option.description ?? undefined}
              secondaryTypographyProps={{ color: "text.secondary" }}
            />
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          error={error}
          helperText={helperText}
          placeholder={placeholder}
          slotProps={{
            input: {
              ...params.InputProps,
              endAdornment: (
                <>
                  {loading ? <CircularProgress color="inherit" size={18} /> : null}
                  {params.InputProps.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  );
}
