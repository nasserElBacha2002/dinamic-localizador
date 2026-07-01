import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getStoreLookups } from "../../api/lookups.api";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import type { StoreLookup } from "../../types/lookups";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";
import { terminology } from "../../domain/terminology";
import { SearchAutocomplete } from "../common/SearchAutocomplete";

interface StoreLookupAutocompleteProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  activeOnly?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

function mapStoreLookupToOption(store: StoreLookup): SearchAutocompleteOption {
  return {
    id: store.id,
    label: store.name,
    description: store.address ?? undefined,
  };
}

export function StoreLookupAutocomplete({
  value,
  onChange,
  label = terminology.location.singular,
  activeOnly = true,
  error = false,
  helperText,
  disabled = false,
  required = false,
  placeholder = `Nombre o dirección de la ${terminology.location.singular.toLowerCase()}`,
}: StoreLookupAutocompleteProps) {
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();

  const fetchStores = useCallback(
    async (search: string) =>
      getStoreLookups({
        search: search || undefined,
        limit: 20,
        active: activeOnly ? true : undefined,
      }),
    [activeOnly],
  );

  const mapToOption = useCallback((store: StoreLookup) => mapStoreLookupToOption(store), []);

  const { inputValue, setInputValue, options, isLoading, hasSearched } = useAsyncSearchOptions({
    queryKey: "store-lookup-search",
    fetchItems: fetchStores,
    mapToOption,
    enabled: companyReady,
    queryExtra: { activeOnly, companyId },
  });

  const selectedLookupQuery = useQuery({
    queryKey: ["lookups", "stores", companyId, "selected", value],
    queryFn: () => getStoreLookups({ id: value!, limit: 1 }),
    enabled: companyReady && Boolean(value),
    staleTime: 60_000,
  });

  const selectedOption = useMemo(() => {
    if (!value) {
      return null;
    }

    const fromOptions = options.find((option) => option.id === value);
    if (fromOptions) {
      return fromOptions;
    }

    if (selectedLookupQuery.data?.[0]) {
      return mapStoreLookupToOption(selectedLookupQuery.data[0]);
    }

    return null;
  }, [options, selectedLookupQuery.data, value]);

  return (
    <SearchAutocomplete
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      inputValue={inputValue}
      onInputChange={setInputValue}
      selectedOption={selectedOption}
      loading={isLoading || selectedLookupQuery.isFetching}
      hasSearched={hasSearched}
      error={error}
      helperText={helperText}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
    />
  );
}
