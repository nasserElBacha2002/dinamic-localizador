import { useMemo } from "react";
import { EmployeeSearchAutocomplete } from "../employees/EmployeeSearchAutocomplete";
import { OperationSearchAutocomplete } from "../operations/OperationSearchAutocomplete";
import { ServiceSearchAutocomplete } from "../services/ServiceSearchAutocomplete";
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

interface StatisticsFiltersBarProps {
  dateRange: DateRangeValue;
  defaultDateRange: DateRangeValue;
  operationId: string;
  serviceId: string;
  employeeId: string;
  operationKind: StatisticsOperationKind;
  effectiveState: StatisticsEffectiveState;
  validationStatus: StatisticsValidationStatus;
  locationStatus: string;
  punctualityStatus: string;
  onDateRangeChange: (value: DateRangeValue) => void;
  onOperationChange: (value: string) => void;
  onServiceChange: (value: string) => void;
  onEmployeeChange: (value: string) => void;
  onOperationKindChange: (value: StatisticsOperationKind) => void;
  onEffectiveStateChange: (value: StatisticsEffectiveState) => void;
  onValidationStatusChange: (value: StatisticsValidationStatus) => void;
  onLocationStatusChange: (value: string) => void;
  onPunctualityStatusChange: (value: string) => void;
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
  operationId,
  serviceId,
  employeeId,
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

  return (
    <FilterBar>
      <FilterBar.Item minWidth={280}>
        <FilterDateRangeInput
          value={dateRange}
          onChange={onDateRangeChange}
          mode="past"
          label="Fecha de jornada"
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
