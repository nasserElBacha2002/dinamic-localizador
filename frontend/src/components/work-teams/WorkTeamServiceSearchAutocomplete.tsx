import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getServiceById, getServices } from "../../api/services.api";
import { SearchAutocomplete } from "../common/SearchAutocomplete";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { requireCompanyId } from "../../hooks/require-company-id";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import { DEFAULT_LOOKUP_LIMIT, LOOKUP_STALE_TIME_MS } from "../../queryKeys/lookups";
import type { Service } from "../../types/service";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";

interface WorkTeamServiceSearchAutocompleteProps {
  value: string | null;
  clientId: string | null;
  onChange: (value: string | null) => void;
  onServiceSelected?: (service: Service | null) => void;
  disabled?: boolean;
}

function mapServiceToOption(service: Service): SearchAutocompleteOption {
  return {
    id: service.id,
    label: service.name,
    description: service.address ?? undefined,
  };
}

/** Service search used by Work Team AI setup, optionally constrained to a client. */
export function WorkTeamServiceSearchAutocomplete({
  value,
  clientId,
  onChange,
  onServiceSelected,
  disabled = false,
}: WorkTeamServiceSearchAutocompleteProps) {
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();

  const fetchServices = useCallback(
    async (search: string, signal: AbortSignal) => {
      const response = await getServices(
        {
          search: search || undefined,
          page: 1,
          limit: DEFAULT_LOOKUP_LIMIT,
          active: true,
          clientId: clientId ?? undefined,
        },
        { signal, scopeCompanyId: requireCompanyId(companyId) },
      );
      return response.data;
    },
    [clientId, companyId],
  );

  const getQueryKey = useCallback(
    (search: string) =>
      [
        "work-team-service-search",
        companyId,
        { search, page: 1, limit: DEFAULT_LOOKUP_LIMIT, active: true, clientId },
      ] as const,
    [clientId, companyId],
  );

  const { inputValue, setInputValue, options, items, isLoading, hasSearched } =
    useAsyncSearchOptions({
      getQueryKey,
      fetchItems: fetchServices,
      mapToOption: mapServiceToOption,
      scopeKey: `${companyId ?? ""}:${clientId ?? ""}`,
      enabled: companyReady,
      staleTime: LOOKUP_STALE_TIME_MS,
    });

  const selectedServiceQuery = useQuery({
    queryKey: ["work-team-service-search", companyId, "selected", value],
    queryFn: ({ signal }) =>
      getServiceById(value!, { signal, scopeCompanyId: requireCompanyId(companyId) }),
    enabled: companyReady && Boolean(value),
    staleTime: LOOKUP_STALE_TIME_MS,
  });

  const selectedService = useMemo(
    () => items.find((service) => service.id === value) ?? selectedServiceQuery.data ?? null,
    [items, selectedServiceQuery.data, value],
  );

  const handleChange = (nextValue: string | null) => {
    onChange(nextValue);
    if (!nextValue) {
      onServiceSelected?.(null);
      return;
    }

    const selected = items.find((service) => service.id === nextValue);
    if (selected) {
      onServiceSelected?.(selected);
    }
  };

  return (
    <SearchAutocomplete
      label="Sucursal (opcional)"
      value={value}
      onChange={handleChange}
      options={options}
      inputValue={inputValue}
      onInputChange={setInputValue}
      selectedOption={selectedService ? mapServiceToOption(selectedService) : null}
      loading={isLoading || selectedServiceQuery.isFetching}
      hasSearched={hasSearched}
      disabled={disabled}
      placeholder="Buscar sucursal..."
    />
  );
}
