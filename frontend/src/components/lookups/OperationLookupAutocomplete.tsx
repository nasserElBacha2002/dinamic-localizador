import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getOperationLookups } from "../../api/lookups.api";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
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
    async (search: string) =>
      getOperationLookups({
        search: search || undefined,
        limit: 10,
      }),
    [],
  );

  const mapToOption = useCallback(
    (operation: OperationLookup) => mapOperationLookupToOption(operation),
    [],
  );

  const { inputValue, setInputValue, options, isLoading, hasSearched } = useAsyncSearchOptions({
    queryKey: "operation-lookup-search",
    fetchItems: fetchOperations,
    mapToOption,
    enabled: companyReady,
    queryExtra: { companyId },
  });

  const selectedLookupQuery = useQuery({
    queryKey: ["lookups", "operations", companyId, "selected", value],
    queryFn: () => getOperationLookups({ id: value!, limit: 1 }),
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
