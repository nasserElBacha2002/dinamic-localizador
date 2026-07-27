import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOperationLookups } from "../../api/lookups.api";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import {
  DEFAULT_LOOKUP_LIMIT,
  LOOKUP_STALE_TIME_MS,
  lookupKeys,
} from "../../queryKeys/lookups";
import type { OperationLookup } from "../../types/lookups";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";
import { terminology } from "../../domain/terminology";
import { formatDateTime } from "../../utils/dates";
import { SearchAutocomplete } from "../common/SearchAutocomplete";

interface OperationLookupAutocompleteProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

function mapOperationLookupToOption(operation: OperationLookup): SearchAutocompleteOption {
  return {
    id: operation.id,
    label: `${operation.serviceName} · ${formatDateTime(operation.startDate)}`,
    description: operation.endDate ? formatDateTime(operation.endDate) : undefined,
  };
}

export function OperationLookupAutocomplete({
  value,
  onChange,
  label = terminology.operation.singular,
  error = false,
  helperText,
  disabled = false,
  required = false,
  placeholder = `${terminology.service.singular} o fecha de la ${terminology.operation.singular.toLowerCase()}`,
}: OperationLookupAutocompleteProps) {
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();

  const fetchOperations = useCallback(
    async (search: string, signal: AbortSignal) =>
      getOperationLookups(
        {
          search: search || undefined,
          limit: DEFAULT_LOOKUP_LIMIT,
        },
        { signal },
      ),
    [],
  );

  const mapToOption = useCallback(
    (operation: OperationLookup) => mapOperationLookupToOption(operation),
    [],
  );

  const getQueryKey = useCallback(
    (search: string) =>
      lookupKeys.operationSearch(companyId, {
        search,
        activeOnly: true,
        limit: DEFAULT_LOOKUP_LIMIT,
      }),
    [companyId],
  );

  const { inputValue, setInputValue, options, isLoading, hasSearched } = useAsyncSearchOptions({
    getQueryKey,
    fetchItems: fetchOperations,
    mapToOption,
    scopeKey: companyId,
    enabled: companyReady,
    staleTime: LOOKUP_STALE_TIME_MS,
  });

  const selectedLookupQuery = useQuery({
    queryKey: lookupKeys.operationSelected(companyId, value),
    queryFn: ({ signal }) => getOperationLookups({ id: value!, limit: 1 }, { signal }),
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
      return mapOperationLookupToOption(selectedLookupQuery.data[0]);
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
