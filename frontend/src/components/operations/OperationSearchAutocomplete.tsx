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

function mapOperationToOption(operation: OperationWithService): SearchAutocompleteOption {
  return {
    id: operation.id,
    label: `${operation.service.name} · ${formatDateTime(operation.scheduledStart)}`,
    description: operation.service.address ?? operationStatusLabels[operation.status],
  };
}

export function OperationSearchAutocomplete({
  value,
  onChange,
  label = "Operación",
  allowCreate = true,
  error = false,
  helperText,
  disabled = false,
  required = false,
  placeholder = "Servicio o dirección de la operación",
}: OperationSearchAutocompleteProps) {
  const navigate = useNavigate();
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();
  const selectedOperationQuery = useOperation(value ?? undefined);

  const fetchOperations = useCallback(async (search: string) => {
    const response = await getOperations({
      search: search || undefined,
      page: 1,
      limit: 20,
    });

    return response.data;
  }, []);

  const mapToOption = useCallback(
    (operation: OperationWithService) => mapOperationToOption(operation),
    [],
  );

  const {
    inputValue,
    setInputValue,
    options,
    isLoading,
    hasSearched,
  } = useAsyncSearchOptions({
    queryKey: "operation-search",
    fetchItems: fetchOperations,
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
              getLabel: () => "Crear operación",
              getDescription: (query) =>
                query
                  ? `No se encontraron operaciones para "${query}"`
                  : "No se encontraron operaciones",
              onSelect: () => navigate("/operations/new"),
            }
          : undefined
      }
    />
  );
}
