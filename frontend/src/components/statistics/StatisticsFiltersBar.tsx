import { useMemo } from "react";
import { EmployeeSearchAutocomplete } from "../employees/EmployeeSearchAutocomplete";
import { OperationSearchAutocomplete } from "../operations/OperationSearchAutocomplete";
import { ServiceSearchAutocomplete } from "../services/ServiceSearchAutocomplete";
import { FilterBar, FilterDateRangeInput, FilterSelect } from "../../design-system";
import type { DateRangeValue } from "../../types/date-range";
import type { StatisticsValidationStatus } from "../../types/statistics";
import {
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";

interface StatisticsFiltersBarProps {
  dateRange: DateRangeValue;
  defaultDateRange: DateRangeValue;
  operationId: string;
  serviceId: string;
  employeeId: string;
  validationStatus: StatisticsValidationStatus;
  locationStatus: string;
  punctualityStatus: string;
  onDateRangeChange: (value: DateRangeValue) => void;
  onOperationChange: (value: string) => void;
  onServiceChange: (value: string) => void;
  onEmployeeChange: (value: string) => void;
  onValidationStatusChange: (value: StatisticsValidationStatus) => void;
  onLocationStatusChange: (value: string) => void;
  onPunctualityStatusChange: (value: string) => void;
}

export function StatisticsFiltersBar({
  dateRange,
  defaultDateRange,
  operationId,
  serviceId,
  employeeId,
  validationStatus,
  locationStatus,
  punctualityStatus,
  onDateRangeChange,
  onOperationChange,
  onServiceChange,
  onEmployeeChange,
  onValidationStatusChange,
  onLocationStatusChange,
  onPunctualityStatusChange,
}: StatisticsFiltersBarProps) {
  const validationOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...(["VALID", "PENDING_REVIEW", "REJECTED"] as const).map((status) => ({
        value: status,
        label: validationStatusLabels[status],
      })),
      { value: "NO_CHECK_IN", label: "Sin asistencia" },
    ],
    [],
  );

  const locationOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...Object.entries(locationStatusLabels).map(([value, label]) => ({ value, label })),
    ],
    [],
  );

  const punctualityOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...Object.entries(punctualityStatusLabels).map(([value, label]) => ({ value, label })),
    ],
    [],
  );

  return (
    <FilterBar>
      <FilterBar.Item minWidth={280}>
        <FilterDateRangeInput
          value={dateRange}
          onChange={onDateRangeChange}
          mode="past"
          label="Fecha"
          defaultValue={defaultDateRange}
          allowCustomRange
        />
      </FilterBar.Item>
      <FilterBar.Item>
        <OperationSearchAutocomplete
          value={operationId || null}
          onChange={(id) => onOperationChange(id ?? "")}
          allowCreate={false}
        />
      </FilterBar.Item>
      <FilterBar.Item>
        <ServiceSearchAutocomplete
          value={serviceId || null}
          onChange={(id) => onServiceChange(id ?? "")}
          allowCreate={false}
        />
      </FilterBar.Item>
      <FilterBar.Item>
        <EmployeeSearchAutocomplete
          value={employeeId || null}
          onChange={(id) => onEmployeeChange(id ?? "")}
          activeOnly={false}
          allowCreate={false}
        />
      </FilterBar.Item>
      <FilterBar.Item>
        <FilterSelect
          label="Estado validación"
          value={validationStatus}
          onChange={(value) => onValidationStatusChange(value as StatisticsValidationStatus)}
          data={validationOptions}
        />
      </FilterBar.Item>
      <FilterBar.Item>
        <FilterSelect
          label="Estado ubicación"
          value={locationStatus}
          onChange={onLocationStatusChange}
          data={locationOptions}
        />
      </FilterBar.Item>
      <FilterBar.Item>
        <FilterSelect
          label="Puntualidad"
          value={punctualityStatus}
          onChange={onPunctualityStatusChange}
          data={punctualityOptions}
        />
      </FilterBar.Item>
    </FilterBar>
  );
}
