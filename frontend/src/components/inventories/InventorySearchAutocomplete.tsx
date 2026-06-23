import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getInventories } from "../../api/inventories.api";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useInventory } from "../../hooks/useInventories";
import type { InventoryWithStore } from "../../types/inventory";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";
import { formatDateTime } from "../../utils/dates";
import { inventoryStatusLabels } from "../../utils/labels";
import { SearchAutocomplete } from "../common/SearchAutocomplete";

interface InventorySearchAutocompleteProps {
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

function mapInventoryToOption(inventory: InventoryWithStore): SearchAutocompleteOption {
  return {
    id: inventory.id,
    label: `${inventory.store.name} · ${formatDateTime(inventory.scheduledStart)}`,
    description: inventory.store.address ?? inventoryStatusLabels[inventory.status],
  };
}

export function InventorySearchAutocomplete({
  value,
  onChange,
  label = "Inventario",
  allowCreate = true,
  error = false,
  helperText,
  disabled = false,
  required = false,
  placeholder = "Tienda o dirección del inventario",
}: InventorySearchAutocompleteProps) {
  const navigate = useNavigate();
  const selectedInventoryQuery = useInventory(value ?? undefined);

  const fetchInventories = useCallback(async (search: string) => {
    const response = await getInventories({
      search: search || undefined,
      page: 1,
      limit: 20,
    });

    return response.data;
  }, []);

  const mapToOption = useCallback(
    (inventory: InventoryWithStore) => mapInventoryToOption(inventory),
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
  });

  const selectedOption = useMemo(() => {
    if (!value || !selectedInventoryQuery.data) {
      return null;
    }

    return {
      id: selectedInventoryQuery.data.id,
      label: `${selectedInventoryQuery.data.store.name} · ${formatDateTime(selectedInventoryQuery.data.scheduledStart)}`,
      description: selectedInventoryQuery.data.store.address,
    };
  }, [selectedInventoryQuery.data, value]);

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
              onSelect: () => navigate("/inventories/new"),
            }
          : undefined
      }
    />
  );
}
