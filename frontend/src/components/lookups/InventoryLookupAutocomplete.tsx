import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getInventoryLookups } from "../../api/lookups.api";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import type { InventoryLookup } from "../../types/lookups";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";
import { terminology } from "../../domain/terminology";
import { formatDateTime } from "../../utils/dates";
import { SearchAutocomplete } from "../common/SearchAutocomplete";

interface InventoryLookupAutocompleteProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

function mapInventoryLookupToOption(inventory: InventoryLookup): SearchAutocompleteOption {
  return {
    id: inventory.id,
    label: `${inventory.storeName} · ${formatDateTime(inventory.startDate)}`,
    description: inventory.endDate ? formatDateTime(inventory.endDate) : undefined,
  };
}

export function InventoryLookupAutocomplete({
  value,
  onChange,
  label = terminology.operation.singular,
  error = false,
  helperText,
  disabled = false,
  required = false,
  placeholder = `${terminology.location.singular} o fecha de la ${terminology.operation.singular.toLowerCase()}`,
}: InventoryLookupAutocompleteProps) {
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();

  const fetchInventories = useCallback(
    async (search: string) =>
      getInventoryLookups({
        search: search || undefined,
        limit: 20,
      }),
    [],
  );

  const mapToOption = useCallback(
    (inventory: InventoryLookup) => mapInventoryLookupToOption(inventory),
    [],
  );

  const { inputValue, setInputValue, options, isLoading, hasSearched } = useAsyncSearchOptions({
    queryKey: "inventory-lookup-search",
    fetchItems: fetchInventories,
    mapToOption,
    enabled: companyReady,
    queryExtra: { companyId },
  });

  const selectedLookupQuery = useQuery({
    queryKey: ["lookups", "inventories", companyId, "selected", value],
    queryFn: () => getInventoryLookups({ id: value!, limit: 1 }),
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
      return mapInventoryLookupToOption(selectedLookupQuery.data[0]);
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
