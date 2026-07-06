import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getServiceLookups } from "../../api/lookups.api";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import type { ServiceLookup } from "../../types/lookups";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";
import { terminology } from "../../domain/terminology";
import { SearchAutocomplete } from "../common/SearchAutocomplete";

interface ServiceLookupAutocompleteProps {
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

function mapServiceLookupToOption(service: ServiceLookup): SearchAutocompleteOption {
  return {
    id: service.id,
    label: service.name,
    description: service.address ?? undefined,
  };
}

export function ServiceLookupAutocomplete({
  value,
  onChange,
  label = terminology.service.singular,
  activeOnly = true,
  error = false,
  helperText,
  disabled = false,
  required = false,
  placeholder = `Nombre o dirección de la ${terminology.service.singular.toLowerCase()}`,
}: ServiceLookupAutocompleteProps) {
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();

  const fetchServices = useCallback(
    async (search: string) =>
      getServiceLookups({
        search: search || undefined,
        limit: 10,
        active: activeOnly ? true : undefined,
      }),
    [activeOnly],
  );

  const mapToOption = useCallback((service: ServiceLookup) => mapServiceLookupToOption(service), []);

  const { inputValue, setInputValue, options, isLoading, hasSearched } = useAsyncSearchOptions({
    queryKey: "service-lookup-search",
    fetchItems: fetchServices,
    mapToOption,
    enabled: companyReady,
    queryExtra: { activeOnly, companyId },
  });

  const selectedLookupQuery = useQuery({
    queryKey: ["lookups", "services", companyId, "selected", value],
    queryFn: () => getServiceLookups({ id: value!, limit: 1 }),
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
      return mapServiceLookupToOption(selectedLookupQuery.data[0]);
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
