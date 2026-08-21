import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getEmployeeLookups } from "../../api/lookups.api";
import { getWhatsappObservabilityEmployeeLookups } from "../../api/whatsapp-observability.api";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import {
  DEFAULT_LOOKUP_LIMIT,
  LOOKUP_STALE_TIME_MS,
  lookupKeys,
} from "../../queryKeys/lookups";
import type { EmployeeLookup } from "../../types/lookups";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";
import { terminology } from "../../domain/terminology";
import { SearchAutocomplete } from "../common/SearchAutocomplete";

export type EmployeeLookupScope = "company" | "platform";

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
  /**
   * `company` (default): active-company lookups.
   * `platform`: cross-company lookups for platform observability (platform admin API).
   */
  scope?: EmployeeLookupScope;
}

function mapEmployeeLookupToOption(employee: EmployeeLookup): SearchAutocompleteOption {
  return {
    id: employee.id,
    label: employee.fullName,
    description: employee.companyName ?? null,
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
  scope = "company",
}: EmployeeLookupAutocompleteProps) {
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();
  const isPlatformScope = scope === "platform";
  const lookupEnabled = isPlatformScope ? true : companyReady;
  const scopeKey = isPlatformScope ? "platform" : companyId;

  const fetchEmployees = useCallback(
    async (search: string, signal: AbortSignal) => {
      if (isPlatformScope) {
        return getWhatsappObservabilityEmployeeLookups(
          {
            search: search || undefined,
            limit: DEFAULT_LOOKUP_LIMIT,
            active: activeOnly ? true : undefined,
          },
          { signal },
        );
      }
      return getEmployeeLookups(
        {
          search: search || undefined,
          limit: DEFAULT_LOOKUP_LIMIT,
          active: activeOnly ? true : undefined,
        },
        { signal },
      );
    },
    [activeOnly, isPlatformScope],
  );

  const mapToOption = useCallback(
    (employee: EmployeeLookup) => mapEmployeeLookupToOption(employee),
    [],
  );

  const getQueryKey = useCallback(
    (search: string) =>
      isPlatformScope
        ? lookupKeys.employeePlatformSearch({
            search,
            activeOnly,
            limit: DEFAULT_LOOKUP_LIMIT,
          })
        : lookupKeys.employeeSearch(companyId, {
            search,
            activeOnly,
            limit: DEFAULT_LOOKUP_LIMIT,
          }),
    [activeOnly, companyId, isPlatformScope],
  );

  const { inputValue, setInputValue, options, isLoading, hasSearched } = useAsyncSearchOptions({
    getQueryKey,
    fetchItems: fetchEmployees,
    mapToOption,
    scopeKey,
    enabled: lookupEnabled,
    staleTime: LOOKUP_STALE_TIME_MS,
  });

  const selectedLookupQuery = useQuery({
    queryKey: isPlatformScope
      ? lookupKeys.employeePlatformSelected(value)
      : lookupKeys.employeeSelected(companyId, value),
    queryFn: ({ signal }) =>
      isPlatformScope
        ? getWhatsappObservabilityEmployeeLookups({ id: value!, limit: 1 }, { signal })
        : getEmployeeLookups({ id: value!, limit: 1 }, { signal }),
    enabled: lookupEnabled && Boolean(value),
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
