import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getEmployeeLookups } from "../../api/lookups.api";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import { LOOKUP_STALE_TIME_MS, lookupKeys } from "../../queryKeys/lookups";
import type { EmployeeLookup } from "../../types/lookups";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";
import { terminology } from "../../domain/terminology";
import { SearchAutocomplete } from "../common/SearchAutocomplete";

interface EmployeeLookupAutocompleteProps {
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

const DEFAULT_LIMIT = 10;

function mapEmployeeLookupToOption(employee: EmployeeLookup): SearchAutocompleteOption {
  return {
    id: employee.id,
    label: employee.fullName,
  };
}

export function EmployeeLookupAutocomplete({
  value,
  onChange,
  label = terminology.worker.singular,
  activeOnly = true,
  error = false,
  helperText,
  disabled = false,
  required = false,
  placeholder = `Nombre del ${terminology.worker.singular.toLowerCase()}`,
}: EmployeeLookupAutocompleteProps) {
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();

  const fetchEmployees = useCallback(
    async (search: string, signal: AbortSignal) =>
      getEmployeeLookups(
        {
          search: search || undefined,
          limit: DEFAULT_LIMIT,
          active: activeOnly ? true : undefined,
        },
        { signal },
      ),
    [activeOnly],
  );

  const mapToOption = useCallback(
    (employee: EmployeeLookup) => mapEmployeeLookupToOption(employee),
    [],
  );

  const getQueryKey = useCallback(
    (search: string) =>
      lookupKeys.employeeSearch(companyId, {
        search,
        activeOnly,
        limit: DEFAULT_LIMIT,
      }),
    [activeOnly, companyId],
  );

  const { inputValue, setInputValue, options, isLoading, hasSearched } = useAsyncSearchOptions({
    getQueryKey,
    fetchItems: fetchEmployees,
    mapToOption,
    enabled: companyReady,
    staleTime: LOOKUP_STALE_TIME_MS,
  });

  const selectedLookupQuery = useQuery({
    queryKey: lookupKeys.employeeSelected(companyId, value),
    queryFn: ({ signal }) => getEmployeeLookups({ id: value!, limit: 1 }, { signal }),
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
      return mapEmployeeLookupToOption(selectedLookupQuery.data[0]);
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
