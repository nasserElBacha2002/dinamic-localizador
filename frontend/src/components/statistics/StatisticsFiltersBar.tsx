import { FormControl, InputLabel, MenuItem, Select } from "@mui/material";
import { DateRangeFilter } from "../common/DateRangeFilter";
import { FilterItem, ListFilters } from "../common/ListFilters";
import { EmployeeSearchAutocomplete } from "../employees/EmployeeSearchAutocomplete";
import { InventorySearchAutocomplete } from "../inventories/InventorySearchAutocomplete";
import { StoreSearchAutocomplete } from "../stores/StoreSearchAutocomplete";
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
  inventoryId: string;
  storeId: string;
  employeeId: string;
  validationStatus: StatisticsValidationStatus;
  locationStatus: string;
  punctualityStatus: string;
  onDateRangeChange: (value: DateRangeValue) => void;
  onInventoryChange: (value: string) => void;
  onStoreChange: (value: string) => void;
  onEmployeeChange: (value: string) => void;
  onValidationStatusChange: (value: StatisticsValidationStatus) => void;
  onLocationStatusChange: (value: string) => void;
  onPunctualityStatusChange: (value: string) => void;
}

export function StatisticsFiltersBar({
  dateRange,
  defaultDateRange,
  inventoryId,
  storeId,
  employeeId,
  validationStatus,
  locationStatus,
  punctualityStatus,
  onDateRangeChange,
  onInventoryChange,
  onStoreChange,
  onEmployeeChange,
  onValidationStatusChange,
  onLocationStatusChange,
  onPunctualityStatusChange,
}: StatisticsFiltersBarProps) {
  return (
    <ListFilters>
      <FilterItem size={{ xs: 12, sm: 12, md: 6, lg: 4 }}>
        <DateRangeFilter
          value={dateRange}
          onChange={onDateRangeChange}
          mode="past"
          label="Fecha"
          defaultValue={defaultDateRange}
          allowCustomRange
        />
      </FilterItem>
      <FilterItem>
        <InventorySearchAutocomplete
          value={inventoryId || null}
          onChange={(id) => onInventoryChange(id ?? "")}
          allowCreate={false}
        />
      </FilterItem>
      <FilterItem>
        <StoreSearchAutocomplete
          value={storeId || null}
          onChange={(id) => onStoreChange(id ?? "")}
          allowCreate={false}
        />
      </FilterItem>
      <FilterItem>
        <EmployeeSearchAutocomplete
          value={employeeId || null}
          onChange={(id) => onEmployeeChange(id ?? "")}
          activeOnly={false}
          allowCreate={false}
        />
      </FilterItem>
      <FilterItem>
        <FormControl fullWidth>
          <InputLabel id="statistics-validation-status-label">Estado validación</InputLabel>
          <Select
            labelId="statistics-validation-status-label"
            label="Estado validación"
            value={validationStatus}
            onChange={(event) => onValidationStatusChange(event.target.value as StatisticsValidationStatus)}
          >
            <MenuItem value="">Todos</MenuItem>
            {(["VALID", "PENDING_REVIEW", "REJECTED"] as const).map((status) => (
              <MenuItem key={status} value={status}>
                {validationStatusLabels[status]}
              </MenuItem>
            ))}
            <MenuItem value="NO_CHECK_IN">Sin asistencia</MenuItem>
          </Select>
        </FormControl>
      </FilterItem>
      <FilterItem>
        <FormControl fullWidth>
          <InputLabel id="statistics-location-status-label">Estado ubicación</InputLabel>
          <Select
            labelId="statistics-location-status-label"
            label="Estado ubicación"
            value={locationStatus}
            onChange={(event) => onLocationStatusChange(event.target.value)}
          >
            <MenuItem value="">Todos</MenuItem>
            {Object.entries(locationStatusLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </FilterItem>
      <FilterItem>
        <FormControl fullWidth>
          <InputLabel id="statistics-punctuality-status-label">Puntualidad</InputLabel>
          <Select
            labelId="statistics-punctuality-status-label"
            label="Puntualidad"
            value={punctualityStatus}
            onChange={(event) => onPunctualityStatusChange(event.target.value)}
          >
            <MenuItem value="">Todos</MenuItem>
            {Object.entries(punctualityStatusLabels).map(([value, label]) => (
              <MenuItem key={value} value={value}>
                {label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </FilterItem>
    </ListFilters>
  );
}
