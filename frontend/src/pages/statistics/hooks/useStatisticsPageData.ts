import { useCallback, useMemo, useState } from "react";
import {
  useStatisticsByEmployee,
  useStatisticsByOperation,
  useStatisticsByService,
  useStatisticsStatusDistribution,
  useStatisticsSummary,
  useStatisticsTimeline,
} from "../../../hooks/useStatistics";
import { useTableUrlState } from "../../../hooks/useTableUrlState";
import {
  getAttendanceByEmployee,
  getAttendanceByOperation,
  getAttendanceByService,
  getAttendanceWorkdayDetails,
} from "../../../api/statistics.api";
import type {
  StatisticsEffectiveState,
  StatisticsFilters,
  StatisticsOperationKind,
  StatisticsValidationStatus,
} from "../../../types/statistics";
import type { StatisticsTabKey } from "../statistics-table-state";
import type { DateRangeValue } from "../../../types/date-range";
import {
  buildStatisticsTableDefaults,
  STATISTICS_TABLE_FIELDS,
} from "../statistics-table-state";
import {
  areDateRangeUrlFieldsEqual,
  dateRangeToUrlFields,
  urlFieldsToDateRange,
} from "../../../utils/date-range-url";
import {
  getDefaultStatisticsDateRange,
  getDateRangeQueryValue,
  isInvalidCustomDateRange,
} from "../../../utils/date-range";
import { dateInputToIsoEnd, dateInputToIsoStart, formatDateTime } from "../../../utils/dates";
import { formatPercent } from "../../../utils/export";
import { formatDurationFromMinutes } from "../../../utils/duration";
import { terminology } from "../../../domain/terminology";
import { operationKindLabels } from "../../../utils/operation-schedule-display";
import {
  checkoutStatusLabels,
  employeeTypeLabels,
  punctualityStatusLabels,
} from "../../../utils/labels";
import { employeeWorkdayEffectiveStateLabels } from "../../../utils/statistics-display-labels";
import {
  buildStatusDistributionOption,
  buildTimelineChartOption,
} from "../../../components/statistics/statistics-chart-options";
import {
  buildEmployeeTableExportFilters,
  buildOperationTableExportFilters,
  buildServiceTableExportFilters,
  buildTopEmployeesByAttendanceFilters,
  buildTopLateEmployeesFilters,
  buildTopOperationsByAttendanceFilters,
  buildTopServicesByAttendanceFilters,
  buildWorkdayDetailExportFilters,
} from "../statistics-page-queries";

export type { StatisticsTabKey } from "../statistics-table-state";

const SUMMARY_HEADERS = ["Métrica", "Valor"];

const WORKDAY_DETAIL_HEADERS = [
  "Fecha de jornada",
  "Empleado",
  "Tipo de empleado",
  "Servicio",
  "Tipo de operación",
  "Hora esperada de ingreso",
  "Hora esperada de salida",
  "Estado de jornada",
  "Hora de ingreso",
  "Estado de llegada",
  "Hora de salida",
  "Estado de salida",
  "Minutos trabajados",
  "Minutos extra",
  "Tipo de ausencia",
];

export function useStatisticsPageData() {
  const [defaultDateRange] = useState<DateRangeValue>(() => getDefaultStatisticsDateRange());
  const defaultDateFields = useMemo(
    () => dateRangeToUrlFields(defaultDateRange),
    [defaultDateRange],
  );
  const tableDefaults = useMemo(
    () => buildStatisticsTableDefaults(defaultDateFields),
    [defaultDateFields],
  );
  const shouldOmitFromUrl = useCallback(
    (
      key: keyof typeof tableDefaults,
      value: (typeof tableDefaults)[keyof typeof tableDefaults],
      defaults: typeof tableDefaults,
      state: typeof tableDefaults,
    ) => {
      if (key === "datePreset" || key === "dateFrom" || key === "dateTo") {
        return areDateRangeUrlFieldsEqual(
          {
            datePreset: String(state.datePreset),
            dateFrom: String(state.dateFrom),
            dateTo: String(state.dateTo),
          },
          defaultDateFields,
        );
      }

      return value === defaults[key] || value === "";
    },
    [defaultDateFields],
  );

  const table = useTableUrlState({
    defaults: tableDefaults,
    fields: STATISTICS_TABLE_FIELDS,
    shouldOmitFromUrl,
  });

  const dateRange = useMemo(
    () =>
      urlFieldsToDateRange({
        datePreset: table.state.datePreset,
        dateFrom: table.state.dateFrom,
        dateTo: table.state.dateTo,
      }),
    [table.state.dateFrom, table.state.datePreset, table.state.dateTo],
  );

  const dateQuery = getDateRangeQueryValue(dateRange);
  const isoDateFrom = dateQuery.from ? dateInputToIsoStart(dateQuery.from) : undefined;
  const isoDateTo = dateQuery.to ? dateInputToIsoEnd(dateQuery.to) : undefined;
  const exportsDisabled = isInvalidCustomDateRange(dateRange);

  const baseFilters = useMemo<StatisticsFilters>(
    () => ({
      dateFrom: isoDateFrom,
      dateTo: isoDateTo,
      operationId: table.state.operationId || undefined,
      serviceId: table.state.serviceId || undefined,
      employeeId: table.state.employeeId || undefined,
      operationKind: (table.state.operationKind as StatisticsOperationKind) || undefined,
      effectiveState: (table.state.effectiveState as StatisticsEffectiveState) || undefined,
      validationStatus: (table.state.validationStatus as StatisticsValidationStatus) || undefined,
      locationStatus: table.state.locationStatus || undefined,
      punctualityStatus: table.state.punctualityStatus || undefined,
    }),
    [
      isoDateFrom,
      isoDateTo,
      table.state.employeeId,
      table.state.operationId,
      table.state.operationKind,
      table.state.effectiveState,
      table.state.locationStatus,
      table.state.punctualityStatus,
      table.state.serviceId,
      table.state.validationStatus,
    ],
  );

  const employeeFilters = useMemo(
    () => ({
      ...baseFilters,
      page: table.state.empPage,
      limit: table.state.empPageSize,
      sortBy: table.state.empSortBy,
      sortDirection: table.state.empSortOrder,
    }),
    [baseFilters, table.state.empPage, table.state.empPageSize, table.state.empSortBy, table.state.empSortOrder],
  );

  const operationFilters = useMemo(
    () => ({
      ...baseFilters,
      page: table.state.opPage,
      limit: table.state.opPageSize,
      sortBy: table.state.opSortBy,
      sortDirection: table.state.opSortOrder,
    }),
    [baseFilters, table.state.opPage, table.state.opPageSize, table.state.opSortBy, table.state.opSortOrder],
  );

  const serviceFilters = useMemo(
    () => ({
      ...baseFilters,
      page: table.state.svcPage,
      limit: table.state.svcPageSize,
      sortBy: table.state.svcSortBy,
      sortDirection: table.state.svcSortOrder,
    }),
    [baseFilters, table.state.svcPage, table.state.svcPageSize, table.state.svcSortBy, table.state.svcSortOrder],
  );

  const topEmployeeChartFilters = useMemo(
    () => buildTopEmployeesByAttendanceFilters(baseFilters),
    [baseFilters],
  );
  const topLateEmployeeChartFilters = useMemo(
    () => buildTopLateEmployeesFilters(baseFilters),
    [baseFilters],
  );
  const topOperationChartFilters = useMemo(
    () => buildTopOperationsByAttendanceFilters(baseFilters),
    [baseFilters],
  );
  const topServiceChartFilters = useMemo(
    () => buildTopServicesByAttendanceFilters(baseFilters),
    [baseFilters],
  );

  const summaryQuery = useStatisticsSummary(baseFilters);
  const timelineQuery = useStatisticsTimeline(baseFilters);
  const distributionQuery = useStatisticsStatusDistribution(baseFilters);
  const employeeQuery = useStatisticsByEmployee(employeeFilters);
  const operationQuery = useStatisticsByOperation(operationFilters);
  const serviceQuery = useStatisticsByService(serviceFilters);
  const topEmployeesByAttendanceQuery = useStatisticsByEmployee(topEmployeeChartFilters);
  const topLateEmployeesQuery = useStatisticsByEmployee(topLateEmployeeChartFilters);
  const topOperationsByAttendanceQuery = useStatisticsByOperation(topOperationChartFilters);
  const topServicesByAttendanceQuery = useStatisticsByService(topServiceChartFilters);

  const topEmployeesByAttendance = topEmployeesByAttendanceQuery.data?.data ?? [];
  const topLateEmployees = (topLateEmployeesQuery.data?.data ?? []).filter((row) => row.lateWorkdays > 0);
  const topOperationsByAttendance = topOperationsByAttendanceQuery.data?.data ?? [];
  const topServicesByAttendance = topServicesByAttendanceQuery.data?.data ?? [];

  const timeline = timelineQuery.data ?? [];
  const timelineOption = buildTimelineChartOption(
    timeline.map((point) => point.date),
    {
      present: timeline.map((point) => point.present),
      absent: timeline.map((point) => point.absent),
      justified: timeline.map((point) => point.justified),
      expected: timeline.map((point) => point.expected),
    },
  );

  const timelineExportRows = timeline.map((point) => [
    point.date,
    point.present,
    point.absent,
    point.justified,
    point.expected,
    point.scheduled,
    point.onTime,
    point.late,
  ]);

  const distribution = distributionQuery.data ?? [];
  const distributionOption = buildStatusDistributionOption(distribution);

  const summary = summaryQuery.data;
  const summaryExportRows = summary
    ? [
        ["Jornadas programadas", summary.scheduledWorkdays],
        ["Presentes", summary.presentWorkdays],
        ["Ausentes", summary.absentWorkdays],
        ["Justificadas", summary.justifiedWorkdays],
        ["Pendientes / esperadas", summary.expectedOpenWorkdays],
        ["Presentismo", formatPercent(summary.attendanceRate)],
        ["Ausentismo", formatPercent(summary.absenceRate)],
        ["Puntualidad", formatPercent(summary.punctualityRate)],
        ["Horas trabajadas", formatDurationFromMinutes(summary.workedMinutes)],
        ["Horas extra", formatDurationFromMinutes(summary.overtimeMinutes)],
        ["Asistencias sin cierre", summary.openAttendanceWorkdays],
        [terminology.operation.plural, summary.totalOperations],
      ]
    : [];

  const mapWorkdayDetailExportRows = useCallback(
    (rows: Awaited<ReturnType<typeof getAttendanceWorkdayDetails>>["data"]) =>
      rows.map((row) => [
        row.workDate,
        row.employeeName,
        row.employeeType ? (employeeTypeLabels[row.employeeType] ?? row.employeeType) : "",
        row.serviceName,
        operationKindLabels[row.operationKind as keyof typeof operationKindLabels] ?? row.operationKind,
        row.expectedStartAt ? formatDateTime(row.expectedStartAt) : "",
        row.expectedEndAt ? formatDateTime(row.expectedEndAt) : "",
        employeeWorkdayEffectiveStateLabels[row.effectiveState] ?? row.effectiveState,
        row.checkInAt ? formatDateTime(row.checkInAt) : "",
        row.arrivalStatus ? (punctualityStatusLabels[row.arrivalStatus] ?? row.arrivalStatus) : "",
        row.checkOutAt ? formatDateTime(row.checkOutAt) : "",
        row.checkoutStatus ? (checkoutStatusLabels[row.checkoutStatus] ?? row.checkoutStatus) : "",
        row.workedMinutes,
        row.overtimeMinutes,
        row.absenceTypeName ?? "",
      ]),
    [],
  );

  const loadWorkdayDetailExportRows = useCallback(async () => {
    const response = await getAttendanceWorkdayDetails(buildWorkdayDetailExportFilters(baseFilters));
    return mapWorkdayDetailExportRows(response.data);
  }, [baseFilters, mapWorkdayDetailExportRows]);

  const loadEmployeeExportRows = useCallback(async () => {
    const response = await getAttendanceByEmployee(
      buildEmployeeTableExportFilters(
        baseFilters,
        table.state.empSortBy,
        table.state.empSortOrder,
      ),
    );
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
      row.lastAttendanceDate ? formatDateTime(row.lastAttendanceDate) : "—",
    ]);
  }, [baseFilters, table.state.empSortBy, table.state.empSortOrder]);

  const loadOperationExportRows = useCallback(async () => {
    const response = await getAttendanceByOperation(
      buildOperationTableExportFilters(
        baseFilters,
        table.state.opSortBy,
        table.state.opSortOrder,
      ),
    );
    return response.data.map((row) => [
      row.operationId,
      operationKindLabels[row.operationKind as keyof typeof operationKindLabels] ?? row.operationKind,
      row.serviceName,
      row.serviceAddress ?? "",
      row.scheduledStart ? formatDateTime(row.scheduledStart) : "—",
      row.scheduledWorkdays,
      row.presentWorkdays,
      row.absentWorkdays,
      row.justifiedWorkdays,
      row.expectedOpenWorkdays,
      formatPercent(row.attendanceRate),
      formatPercent(row.punctualityRate),
      formatDurationFromMinutes(row.workedMinutes),
      formatDurationFromMinutes(row.overtimeMinutes),
      row.operationalStatus,
    ]);
  }, [baseFilters, table.state.opSortBy, table.state.opSortOrder]);

  const loadServiceExportRows = useCallback(async () => {
    const response = await getAttendanceByService(
      buildServiceTableExportFilters(
        baseFilters,
        table.state.svcSortBy,
        table.state.svcSortOrder,
      ),
    );
    return response.data.map((row) => [
      row.serviceName,
      row.address ?? "",
      row.totalOperations,
      row.scheduledWorkdays,
      row.presentWorkdays,
      row.absentWorkdays,
      row.justifiedWorkdays,
      row.expectedOpenWorkdays,
      formatPercent(row.attendanceRate),
      formatPercent(row.punctualityRate),
      formatDurationFromMinutes(row.workedMinutes),
      formatDurationFromMinutes(row.overtimeMinutes),
    ]);
  }, [baseFilters, table.state.svcSortBy, table.state.svcSortOrder]);

  const resetAllPages = () => {
    table.setState(
      {
        empPage: 1,
        opPage: 1,
        svcPage: 1,
      },
      { resetPage: false },
    );
  };

  const handleEmployeeSort = (field: string) => {
    if (table.state.empSortBy === field) {
      table.setState({
        empSortBy: field,
        empSortOrder: table.state.empSortOrder === "asc" ? "desc" : "asc",
        empPage: 1,
      });
      return;
    }

    table.setState({ empSortBy: field, empSortOrder: "desc", empPage: 1 });
  };

  const handleOperationSort = (field: string) => {
    if (table.state.opSortBy === field) {
      table.setState({
        opSortBy: field,
        opSortOrder: table.state.opSortOrder === "asc" ? "desc" : "asc",
        opPage: 1,
      });
      return;
    }

    table.setState({ opSortBy: field, opSortOrder: "desc", opPage: 1 });
  };

  const handleLocationSort = (field: string) => {
    if (table.state.svcSortBy === field) {
      table.setState({
        svcSortBy: field,
        svcSortOrder: table.state.svcSortOrder === "asc" ? "desc" : "asc",
        svcPage: 1,
      });
      return;
    }

    table.setState({ svcSortBy: field, svcSortOrder: "desc", svcPage: 1 });
  };

  const employeePagination = {
    page: table.state.empPage,
    pageSize: table.state.empPageSize,
    onPageChange: (page: number) => table.setField("empPage", page, { resetPage: false }),
    onPageSizeChange: (pageSize: number) =>
      table.setState({ empPageSize: pageSize, empPage: 1 }, { resetPage: false }),
    resetPage: () => table.setField("empPage", 1, { resetPage: false }),
  };

  const operationPagination = {
    page: table.state.opPage,
    pageSize: table.state.opPageSize,
    onPageChange: (page: number) => table.setField("opPage", page, { resetPage: false }),
    onPageSizeChange: (pageSize: number) =>
      table.setState({ opPageSize: pageSize, opPage: 1 }, { resetPage: false }),
    resetPage: () => table.setField("opPage", 1, { resetPage: false }),
  };

  const servicePagination = {
    page: table.state.svcPage,
    pageSize: table.state.svcPageSize,
    onPageChange: (page: number) => table.setField("svcPage", page, { resetPage: false }),
    onPageSizeChange: (pageSize: number) =>
      table.setState({ svcPageSize: pageSize, svcPage: 1 }, { resetPage: false }),
    resetPage: () => table.setField("svcPage", 1, { resetPage: false }),
  };

  return {
    activeTab: table.state.tab,
    setActiveTab: (tab: StatisticsTabKey) => table.setField("tab", tab, { resetPage: false }),
    defaultDateRange,
    dateRange,
    setDateRange: (value: DateRangeValue) => table.setState(dateRangeToUrlFields(value)),
    operationId: table.state.operationId,
    setOperationId: (value: string) => table.setField("operationId", value),
    serviceId: table.state.serviceId,
    setServiceId: (value: string) => table.setField("serviceId", value),
    employeeId: table.state.employeeId,
    setEmployeeId: (value: string) => table.setField("employeeId", value),
    operationKind: table.state.operationKind as StatisticsOperationKind,
    setOperationKind: (value: string) => table.setField("operationKind", value),
    effectiveState: table.state.effectiveState as StatisticsEffectiveState,
    setEffectiveState: (value: string) => table.setField("effectiveState", value),
    validationStatus: table.state.validationStatus as StatisticsValidationStatus,
    setValidationStatus: (value: string) => table.setField("validationStatus", value),
    locationStatus: table.state.locationStatus,
    setLocationStatus: (value: string) => table.setField("locationStatus", value),
    punctualityStatus: table.state.punctualityStatus,
    setPunctualityStatus: (value: string) => table.setField("punctualityStatus", value),
    exportsDisabled,
    isoDateFrom,
    isoDateTo,
    resetAllPages,
    summaryQuery,
    timelineQuery,
    distributionQuery,
    employeeQuery,
    operationQuery,
    serviceQuery,
    topEmployeesByAttendanceQuery,
    topLateEmployeesQuery,
    topOperationsByAttendanceQuery,
    topServicesByAttendanceQuery,
    employeePagination,
    operationPagination,
    servicePagination,
    employeeSortBy: table.state.empSortBy,
    employeeSortDirection: table.state.empSortOrder,
    operationSortBy: table.state.opSortBy,
    operationSortDirection: table.state.opSortOrder,
    serviceSortBy: table.state.svcSortBy,
    serviceSortDirection: table.state.svcSortOrder,
    handleEmployeeSort,
    handleOperationSort,
    handleLocationSort,
    summaryHeaders: SUMMARY_HEADERS,
    workdayDetailHeaders: WORKDAY_DETAIL_HEADERS,
    summary,
    summaryExportRows,
    timeline,
    timelineOption,
    timelineExportRows,
    distribution,
    distributionOption,
    topEmployeesByAttendance,
    topLateEmployees,
    topOperationsByAttendance,
    topServicesByAttendance,
    loadWorkdayDetailExportRows,
    loadEmployeeExportRows,
    loadOperationExportRows,
    loadServiceExportRows,
  };
}

export type StatisticsPageData = ReturnType<typeof useStatisticsPageData>;
