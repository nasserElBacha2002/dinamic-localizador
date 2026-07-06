import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getOperations } from "../../api/operations.api";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useOperation } from "../../hooks/useOperations";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import type { OperationWithService } from "../../types/operation";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";
import { formatDateTime } from "../../utils/dates";
import { operationStatusLabels } from "../../utils/labels";
import { SearchAutocomplete } from "../common/SearchAutocomplete";

interface OperationSearchAutocompleteProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  allowCreate?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

function mapOperationToOption(inventory: OperationWithService): SearchAutocompleteOption {
  return {
    id: inventory.id,
    label: `${inventory.service.name} · ${formatDateTime(inventory.scheduledStart)}`,
    description: inventory.service.address ?? operationStatusLabels[inventory.status],
  };
}

export function OperationSearchAutocomplete({
  value,
  onChange,
  label = "Inventario",
  allowCreate = true,
  error = false,
  helperText,
  disabled = false,
  required = false,
  placeholder = "Tienda o dirección del inventario",
}: OperationSearchAutocompleteProps) {
  const navigate = useNavigate();
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();
  const selectedOperationQuery = useOperation(value ?? undefined);

  const fetchInventories = useCallback(async (search: string) => {
    const response = await getOperations({
      search: search || undefined,
      page: 1,
      limit: 20,
    });

    return response.data;
  }, []);

  const mapToOption = useCallback(
    (inventory: OperationWithService) => mapOperationToOption(inventory),
    [],
  );

  const {
    inputValue,
    setInputValue,
    options,
    isLoading,
    hasSearched,
  } = useAsyncSearchOptions({
    queryKey: "inventory-search",
    fetchItems: fetchInventories,
    mapToOption,
    enabled: companyReady,
    queryExtra: { companyId },
  });

  const selectedOption = useMemo(() => {
    if (!value || !selectedOperationQuery.data) {
      return null;
    }

    return {
      id: selectedOperationQuery.data.id,
      label: `${selectedOperationQuery.data.service.name} · ${formatDateTime(selectedOperationQuery.data.scheduledStart)}`,
      description: selectedOperationQuery.data.service.address,
    };
  }, [selectedOperationQuery.data, value]);

  return (
    <SearchAutocomplete
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      inputValue={inputValue}
      onInputChange={setInputValue}
      selectedOption={selectedOption}
      loading={isLoading}
      hasSearched={hasSearched}
      error={error}
      helperText={helperText}
      disabled={disabled}
      required={required}
      placeholder={placeholder}
      createOption={
        allowCreate
          ? {
              getLabel: () => "Crear inventario",
              getDescription: (query) =>
                query
                  ? `No se encontraron inventarios para "${query}"`
                  : "No se encontraron inventarios",
              onSelect: () => navigate("/operations/new"),
            }
          : undefined
      }
    />
  );
}
