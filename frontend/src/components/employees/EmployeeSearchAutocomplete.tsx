import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { getEmployees } from "../../api/employees.api";
import { useAsyncSearchOptions } from "../../hooks/useAsyncSearchOptions";
import { useEmployee } from "../../hooks/useEmployees";
import type { Employee } from "../../types/employee";
import type { SearchAutocompleteOption } from "../../types/search-autocomplete";
import { SearchAutocomplete } from "../common/SearchAutocomplete";

interface EmployeeSearchAutocompleteProps {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
  activeOnly?: boolean;
  excludeIds?: string[];
  allowCreate?: boolean;
  error?: boolean;
  helperText?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
}

function mapEmployeeToOption(employee: Employee): SearchAutocompleteOption {
  return {
    id: employee.id,
    label: employee.name,
    description: employee.phoneNumber,
    disabled: !employee.active,
  };
}

export function EmployeeSearchAutocomplete({
  value,
  onChange,
  label = "Empleado",
  activeOnly = true,
  excludeIds = [],
  allowCreate = true,
  error = false,
  helperText,
  disabled = false,
  required = false,
  placeholder = "Nombre o teléfono",
}: EmployeeSearchAutocompleteProps) {
  const navigate = useNavigate();
  const selectedEmployeeQuery = useEmployee(value ?? undefined);
  const excludeKey = excludeIds.join(",");

  const fetchEmployees = useCallback(
    async (search: string) => {
      const response = await getEmployees({
        search: search || undefined,
        page: 1,
        limit: 20,
        active: activeOnly ? true : undefined,
      });

      if (excludeIds.length === 0) {
        return response.data;
      }

      const excluded = new Set(excludeIds);
      return response.data.filter((employee) => !excluded.has(employee.id));
    },
    [activeOnly, excludeIds],
  );

  const mapToOption = useCallback((employee: Employee) => mapEmployeeToOption(employee), []);

  const {
    inputValue,
    setInputValue,
    options,
    isLoading,
    hasSearched,
  } = useAsyncSearchOptions({
    queryKey: "employee-search",
    fetchItems: fetchEmployees,
    mapToOption,
    queryExtra: { activeOnly, excludeKey },
  });

  const selectedOption = useMemo(() => {
    if (!value || !selectedEmployeeQuery.data) {
      return null;
    }

    return mapEmployeeToOption(selectedEmployeeQuery.data);
  }, [selectedEmployeeQuery.data, value]);

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
              getLabel: (query) => `Crear empleado "${query}"`,
              getDescription: () => "No se encontraron empleados con ese criterio",
              onSelect: (query) => {
                const params = new URLSearchParams();
                if (query) {
                  params.set("name", query);
                }
                const suffix = params.toString();
                navigate(suffix ? `/employees/new?${suffix}` : "/employees/new");
              },
            }
          : undefined
      }
    />
  );
}
