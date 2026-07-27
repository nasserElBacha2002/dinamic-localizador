import { useMemo } from "react";
import {
  EmployeeMultiSelect,
  OperationMultiSelect,
  ServiceMultiSelect,
} from "../lookups/EntityMultiSelects";
import { FilterBar, FilterDateRangeInput, FilterSelect } from "../../design-system";
import type { DateRangeValue } from "../../types/date-range";
import type {
  StatisticsEffectiveState,
  StatisticsOperationKind,
  StatisticsValidationStatus,
} from "../../types/statistics";
import {
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";
import { operationKindLabels } from "../../utils/operation-schedule-display";
import { terminology } from "../../domain/terminology";

interface StatisticsFiltersBarProps {
  dateRange: DateRangeValue;
  defaultDateRange: DateRangeValue;
  operationIds: string[];
  serviceIds: string[];
  employeeIds: string[];
  operationKind: StatisticsOperationKind;
  effectiveState: StatisticsEffectiveState;
  validationStatus: StatisticsValidationStatus;
  locationStatus: string;
  punctualityStatus: string;
  onDateRangeChange: (value: DateRangeValue) => void;
  onOperationChange: (value: string[]) => void;
  onServiceChange: (value: string[]) => void;
  onEmployeeChange: (value: string[]) => void;
  onOperationKindChange: (value: StatisticsOperationKind) => void;
  onEffectiveStateChange: (value: StatisticsEffectiveState) => void;
  onValidationStatusChange: (value: StatisticsValidationStatus) => void;
  onLocationStatusChange: (value: string) => void;
  onPunctualityStatusChange: (value: string) => void;
  onClearSecondaryFilters: () => void;
}

const EFFECTIVE_STATE_LABELS: Record<Exclude<StatisticsEffectiveState, "">, string> = {
  EXPECTED: "Pendiente / esperada",
  JUSTIFIED: "Justificada",
  PRESENT: "Con asistencia",
  ABSENT: "Ausente",
  CANCELLED: "Cancelada",
};

export function StatisticsFiltersBar({
  dateRange,
  defaultDateRange,
  operationIds,
  serviceIds,
  employeeIds,
  operationKind,
  effectiveState,
  validationStatus,
  locationStatus,
  punctualityStatus,
  onDateRangeChange,
  onOperationChange,
  onServiceChange,
  onEmployeeChange,
  onOperationKindChange,
  onEffectiveStateChange,
  onValidationStatusChange,
  onLocationStatusChange,
  onPunctualityStatusChange,
  onClearSecondaryFilters,
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

  const operationKindOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...Object.entries(operationKindLabels).map(([value, label]) => ({ value, label })),
    ],
    [],
  );

  const effectiveStateOptions = useMemo(
    () => [
      { value: "", label: "Todos" },
      ...Object.entries(EFFECTIVE_STATE_LABELS).map(([value, label]) => ({ value, label })),
    ],
    [],
  );

  const activeSecondaryFilterCount = useMemo(() => {
    let count = 0;
    if (operationIds.length > 0) count += 1;
    if (serviceIds.length > 0) count += 1;
    if (employeeIds.length > 0) count += 1;
    if (operationKind) count += 1;
    if (effectiveState) count += 1;
    if (validationStatus) count += 1;
    if (locationStatus) count += 1;
    if (punctualityStatus) count += 1;
    return count;
  }, [
    employeeIds.length,
    effectiveState,
    locationStatus,
    operationIds.length,
    operationKind,
    punctualityStatus,
    serviceIds.length,
    validationStatus,
  ]);

  return (
    <FilterBar
      search={
        <FilterDateRangeInput
          value={dateRange}
          onChange={onDateRangeChange}
          mode="past"
          label="Fecha de jornada"
          defaultValue={defaultDateRange}
          allowCustomRange
        />
      }
      activeFilterCount={activeSecondaryFilterCount}
      onClearFilters={onClearSecondaryFilters}
    >
      <FilterBar.Item>
        <OperationMultiSelect
          label={terminology.operation.plural}
          value={operationIds}
          onChange={onOperationChange}
          maxVisibleChips={2}
        />
      </FilterBar.Item>
      <FilterBar.Item>
        <ServiceMultiSelect
          label={terminology.service.plural}
          value={serviceIds}
          onChange={onServiceChange}
          activeOnly={false}
          maxVisibleChips={2}
        />
      </FilterBar.Item>
      <FilterBar.Item>
        <EmployeeMultiSelect
          label={terminology.worker.plural}
          value={employeeIds}
          onChange={onEmployeeChange}
          activeOnly={false}
          maxVisibleChips={2}
        />
      </FilterBar.Item>
      <FilterBar.Item>
        <FilterSelect
          label="Tipo de operación"
          value={operationKind}
          onChange={(value) => onOperationKindChange(value as StatisticsOperationKind)}
          data={operationKindOptions}
        />
      </FilterBar.Item>
      <FilterBar.Item>
        <FilterSelect
          label="Estado de jornada"
          value={effectiveState}
          onChange={(value) => onEffectiveStateChange(value as StatisticsEffectiveState)}
          data={effectiveStateOptions}
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
