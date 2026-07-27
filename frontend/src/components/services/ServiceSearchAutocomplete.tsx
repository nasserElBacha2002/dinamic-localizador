import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { getServiceLookups } from "../../api/lookups.api";
import { SearchAutocomplete } from "../common/SearchAutocomplete";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import {
  DEFAULT_LOOKUP_LIMIT,
  LOOKUP_STALE_TIME_MS,
  lookupKeys,
} from "../../queryKeys/lookups";
import type { ServiceLookup } from "../../types/lookups";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";

interface ServiceSearchAutocompleteProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  activeOnly?: boolean;
  allowCreate?: boolean;
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

export function ServiceSearchAutocomplete({
  value,
  onChange,
  label = "Servicio",
  activeOnly = true,
  allowCreate = true,
  error = false,
  helperText,
  disabled = false,
  required = false,
  placeholder = "Nombre o dirección del servicio",
}: ServiceSearchAutocompleteProps) {
  const navigate = useNavigate();
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();

  const fetchServices = useCallback(
    async (search: string, signal: AbortSignal) =>
      getServiceLookups(
        {
          search: search || undefined,
          limit: DEFAULT_LOOKUP_LIMIT,
          active: activeOnly ? true : undefined,
        },
        { signal },
      ),
    [activeOnly],
  );

  const mapToOption = useCallback((service: ServiceLookup) => mapServiceLookupToOption(service), []);

  const getQueryKey = useCallback(
    (search: string) =>
      lookupKeys.serviceSearch(companyId, {
        search,
        activeOnly,
        limit: DEFAULT_LOOKUP_LIMIT,
      }),
    [activeOnly, companyId],
  );

  const { inputValue, setInputValue, options, isLoading, hasSearched } = useAsyncSearchOptions({
    getQueryKey,
    fetchItems: fetchServices,
    mapToOption,
    scopeKey: companyId,
    enabled: companyReady,
    staleTime: LOOKUP_STALE_TIME_MS,
  });

  const selectedLookupQuery = useQuery({
    queryKey: lookupKeys.serviceSelected(companyId, value),
    queryFn: ({ signal }) =>
      getServiceLookups({ id: value!, limit: 1 }, { signal }),
    enabled: companyReady && Boolean(value),
    staleTime: LOOKUP_STALE_TIME_MS,
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
      createOption={
        allowCreate
          ? {
              getLabel: (query) => `Crear servicio "${query}"`,
              getDescription: () => "No se encontraron servicios con ese criterio",
              onSelect: (query) => {
                const params = new URLSearchParams();
                if (query) {
                  params.set("name", query);
                }
                const suffix = params.toString();
                navigate(suffix ? `/services/new?${suffix}` : "/services/new");
              },
            }
          : undefined
      }
    />
  );
}
