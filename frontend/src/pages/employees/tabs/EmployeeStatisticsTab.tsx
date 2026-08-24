import { SimpleGrid, Stack, Text } from "@mantine/core";
import { useMemo, useState } from "react";
import { StatisticsEmployeeTable } from "../../../components/statistics/StatisticsEmployeeTable";
import { FilterBar, FilterDateRangeInput, SectionCard } from "../../../design-system";
import { useStatisticsByEmployee, useStatisticsSummary } from "../../../hooks/useStatistics";
import {
  getDefaultStatisticsDateRange,
  getDateRangeQueryValue,
} from "../../../utils/date-range";
import { dateInputToIsoEnd, dateInputToIsoStart, formatDateTime } from "../../../utils/dates";
import { formatPercent } from "../../../utils/export";
import { formatDurationFromMinutes } from "../../../utils/duration";
import type { DateRangeValue } from "../../../types/date-range";
import { getAttendanceByEmployee } from "../../../api/statistics.api";

interface EmployeeStatisticsTabProps {
  employeeId: string;
  enabled: boolean;
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <SectionCard title={label}>
      <Text size="lg" fw={600}>
        {value}
      </Text>
    </SectionCard>
  );
}

export function EmployeeStatisticsTab({ employeeId, enabled }: EmployeeStatisticsTabProps) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [sortBy, setSortBy] = useState("employeeName");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [dateRange, setDateRange] = useState<DateRangeValue>(() =>
    getDefaultStatisticsDateRange(),
  );

  const dateQuery = getDateRangeQueryValue(dateRange);
  const isoDateFrom = dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined;
  const isoDateTo = dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined;

  const baseFilters = useMemo(
    () => ({
      dateFrom: isoDateFrom,
      dateTo: isoDateTo,
      employeeIds: [employeeId],
    }),
    [employeeId, isoDateFrom, isoDateTo],
  );

  const summaryQuery = useStatisticsSummary(baseFilters, { enabled });
  const employeeQuery = useStatisticsByEmployee(
    {
      ...baseFilters,
      page,
      limit: pageSize,
      sortBy,
      sortDirection,
    },
    { enabled },
  );

  const summary = summaryQuery.data;
  const rows = employeeQuery.data?.data ?? [];

  const loadExportRows = async () => {
    const response = await getAttendanceByEmployee({
      ...baseFilters,
      page: 1,
      limit: 1000,
      sortBy,
      sortDirection,
    });
    return response.data.map((row) => [
      row.employeeName,
      row.phoneNumber,
      row.scheduledWorkdays,
      row.presentWorkdays,
      row.absentWorkdays,
      row.justifiedWorkdays,
      row.expectedOpenWorkdays,
      formatPercent(row.attendanceRate),
      formatPercent(row.punctualityRate),
      formatDurationFromMinutes(row.workedMinutes),
      formatDurationFromMinutes(row.overtimeMinutes),
      row.lateWorkdays,
      row.earlyDepartureWorkdays,
      row.lastAttendanceDate ? formatDateTime(row.lastAttendanceDate) : null,
    ]);
  };

  return (
    <Stack gap="md">
      <FilterBar
        search={
          <FilterDateRangeInput
            value={dateRange}
            onChange={setDateRange}
            mode="past"
            label="Período"
            allowCustomRange
          />
        }
        activeFilterCount={0}
        onClearFilters={() => setDateRange(getDefaultStatisticsDateRange())}
      >
        <></>
      </FilterBar>

      {summary ? (
        <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="md">
          <MetricCard
            label="Presentismo"
            value={formatPercent(summary.attendanceRate)}
          />
          <MetricCard
            label="Puntualidad"
            value={formatPercent(summary.punctualityRate)}
          />
          <MetricCard
            label="Jornadas presentes"
            value={String(summary.presentWorkdays)}
          />
          <MetricCard
            label="Horas trabajadas"
            value={formatDurationFromMinutes(summary.workedMinutes)}
          />
        </SimpleGrid>
      ) : null}

      <StatisticsEmployeeTable
        rows={rows}
        isLoading={employeeQuery.isPending}
        isError={employeeQuery.isError}
        error={employeeQuery.error}
        page={page}
        pageSize={pageSize}
        total={employeeQuery.data?.meta.total ?? 0}
        sortBy={sortBy as never}
        sortDirection={sortDirection}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
        onSortChange={(field) => {
          if (field === sortBy) {
            setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
            return;
          }
          setSortBy(field);
          setSortDirection("asc");
        }}
        loadExportRows={loadExportRows}
        dateFrom={isoDateFrom}
        dateTo={isoDateTo}
      />
    </Stack>
  );
}
