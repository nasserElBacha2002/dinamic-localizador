import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getServices } from "../../api/services.api";
import { SearchAutocomplete } from "../common/SearchAutocomplete";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useService } from "../../hooks/useServices";
import { useOperationalQueryEnabled } from "../../hooks/useOperationalQueryEnabled";
import type { Service } from "../../types/service";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";

interface ServiceSearchAutocompleteProps {
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

function mapServiceToOption(store: Service): SearchAutocompleteOption {
  return {
    id: store.id,
    label: store.name,
    description: store.address,
    disabled: !store.active,
  };
}

export function ServiceSearchAutocomplete({
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
}: ServiceSearchAutocompleteProps) {
  const navigate = useNavigate();
  const { companyId, enabled: companyReady } = useOperationalQueryEnabled();
  const selectedServiceQuery = useService(value ?? undefined);

  const fetchServices = useCallback(
    async (search: string) => {
      const response = await getServices({
        search: search || undefined,
        page: 1,
        limit: 20,
        active: activeOnly ? true : undefined,
      });

      return response.data;
    },
    [activeOnly],
  );

  const mapToOption = useCallback((store: Service) => mapServiceToOption(store), []);

  const {
    inputValue,
    setInputValue,
    options,
    isLoading,
    hasSearched,
  } = useAsyncSearchOptions({
    queryKey: "store-search",
    fetchItems: fetchServices,
    mapToOption,
    enabled: companyReady,
    queryExtra: { activeOnly, companyId },
  });

  const selectedOption = useMemo(() => {
    if (!value || !selectedServiceQuery.data) {
      return null;
    }

    return mapServiceToOption(selectedServiceQuery.data);
  }, [selectedServiceQuery.data, value]);

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
                navigate(suffix ? `/services/new?${suffix}` : "/services/new");
              },
            }
          : undefined
      }
    />
  );
}
