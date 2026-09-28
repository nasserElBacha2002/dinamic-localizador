import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getClientById, getClients } from "../../api/clients.api";
import { SearchAutocomplete } from "../common/SearchAutocomplete";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { requireCompanyId } from "../../hooks/require-company-id";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import { DEFAULT_LOOKUP_LIMIT, LOOKUP_STALE_TIME_MS } from "../../queryKeys/lookups";
import type { Client } from "../../types/client";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";

interface ClientSearchAutocompleteProps {
  value: string | null;
  onChange: (value: string | null) => void;
  onClientSelected?: (client: Client | null) => void;
  label?: string;
  disabled?: boolean;
}

function mapClientToOption(client: Client): SearchAutocompleteOption {
  return { id: client.id, label: client.name };
}

/** Company-scoped, paginated client lookup for forms that must not preload all clients. */
export function ClientSearchAutocomplete({
  value,
  onChange,
  onClientSelected,
  label = "Cliente (opcional)",
  disabled = false,
}: ClientSearchAutocompleteProps) {
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();

  const fetchClients = useCallback(
    async (search: string, signal: AbortSignal) => {
      const response = await getClients(
        { search: search || undefined, page: 1, limit: DEFAULT_LOOKUP_LIMIT, active: true },
        { signal, scopeCompanyId: requireCompanyId(companyId) },
      );
      return response.data;
    },
    [companyId],
  );

  const getQueryKey = useCallback(
    (search: string) =>
      [
        "client-search-autocomplete",
        companyId,
        { search, page: 1, limit: DEFAULT_LOOKUP_LIMIT, active: true },
      ] as const,
    [companyId],
  );

  const { inputValue, setInputValue, options, items, isLoading, hasSearched } =
    useAsyncSearchOptions({
      getQueryKey,
      fetchItems: fetchClients,
      mapToOption: mapClientToOption,
      scopeKey: companyId,
      enabled: companyReady,
      staleTime: LOOKUP_STALE_TIME_MS,
    });

  const selectedClientQuery = useQuery({
    queryKey: ["client-search-autocomplete", companyId, "selected", value],
    queryFn: ({ signal }) =>
      getClientById(value!, { signal, scopeCompanyId: requireCompanyId(companyId) }),
    enabled: companyReady && Boolean(value),
    staleTime: LOOKUP_STALE_TIME_MS,
  });

  const selectedClient = useMemo(
    () => items.find((client) => client.id === value) ?? selectedClientQuery.data ?? null,
    [items, selectedClientQuery.data, value],
  );

  const handleChange = (nextValue: string | null) => {
    onChange(nextValue);
    if (!nextValue) {
      onClientSelected?.(null);
      return;
    }

    const selected = items.find((client) => client.id === nextValue);
    if (selected) {
      onClientSelected?.(selected);
    }
  };

  return (
    <SearchAutocomplete
      label={label}
      value={value}
      onChange={handleChange}
      options={options}
      inputValue={inputValue}
      onInputChange={setInputValue}
      selectedOption={selectedClient ? mapClientToOption(selectedClient) : null}
      loading={isLoading || selectedClientQuery.isFetching}
      hasSearched={hasSearched}
      disabled={disabled}
      placeholder="Buscar cliente..."
    />
  );
}
