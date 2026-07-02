import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getStores } from "../../api/stores.api";
import { SearchAutocomplete } from "../common/SearchAutocomplete";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useStore } from "../../hooks/useStores";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import type { Store } from "../../types/store";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";

interface StoreSearchAutocompleteProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  activeOnly?: boolean;
  allowCreate?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

function mapStoreToOption(store: Store): SearchAutocompleteOption {
  return {
    id: store.id,
    label: store.name,
    description: store.address,
    disabled: !store.active,
  };
}

export function StoreSearchAutocomplete({
  value,
  onChange,
  label = "Tienda",
  activeOnly = true,
  allowCreate = true,
  error = false,
  helperText,
  disabled = false,
  required = false,
  placeholder = "Nombre o dirección de la tienda",
}: StoreSearchAutocompleteProps) {
  const navigate = useNavigate();
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();
  const selectedStoreQuery = useStore(value ?? undefined);

  const fetchStores = useCallback(
    async (search: string) => {
      const response = await getStores({
        search: search || undefined,
        page: 1,
        limit: 20,
        active: activeOnly ? true : undefined,
      });

      return response.data;
    },
    [activeOnly],
  );

  const mapToOption = useCallback((store: Store) => mapStoreToOption(store), []);

  const {
    inputValue,
    setInputValue,
    options,
    isLoading,
    hasSearched,
  } = useAsyncSearchOptions({
    queryKey: "store-search",
    fetchItems: fetchStores,
    mapToOption,
    enabled: companyReady,
    queryExtra: { activeOnly, companyId },
  });

  const selectedOption = useMemo(() => {
    if (!value || !selectedStoreQuery.data) {
      return null;
    }

    return mapStoreToOption(selectedStoreQuery.data);
  }, [selectedStoreQuery.data, value]);

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
              getLabel: (query) => `Crear tienda "${query}"`,
              getDescription: () => "No se encontraron tiendas con ese criterio",
              onSelect: (query) => {
                const params = new URLSearchParams();
                if (query) {
                  params.set("name", query);
                }
                const suffix = params.toString();
                navigate(suffix ? `/stores/new?${suffix}` : "/stores/new");
              },
            }
          : undefined
      }
    />
  );
}
