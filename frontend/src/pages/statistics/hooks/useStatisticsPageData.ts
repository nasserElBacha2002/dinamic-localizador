import { useCallback, useMemo, useState } from "react";
import {
  useStatisticsByEmployee,
  useStatisticsByOperation,
  useStatisticsByService,
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
  buildActionExceptionsOption,
  buildTimelineChartOption,
} from "../../../components/statistics/statistics-chart-options";
import {
  buildAttentionEmployeesFilters,
  buildEmployeeTableExportFilters,
  buildIncidentServicesFilters,
  buildLowCoverageOperationsFilters,
  buildOperationTableExportFilters,
  buildServiceTableExportFilters,
  buildTopLateEmployeesFilters,
  buildWorkdayDetailExportFilters,
} from "../statistics-page-queries";
import type { StatisticsDeepLinkContext } from "../../../utils/statistics-deep-links";

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
    filterRetainKeys: [
      "tab",
      "empPageSize",
      "opPageSize",
      "svcPageSize",
      "empSortBy",
      "empSortOrder",
      "opSortBy",
      "opSortOrder",
      "svcSortBy",
      "svcSortOrder",
    ],
    filterActivityIgnoreKeys: [
      "tab",
      "empPage",
      "empPageSize",
      "opPage",
      "opPageSize",
      "svcPage",
      "svcPageSize",
      "empSortBy",
      "empSortOrder",
      "opSortBy",
      "opSortOrder",
      "svcSortBy",
      "svcSortOrder",
    ],
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
      operationIds: table.state.operationIds.length > 0 ? table.state.operationIds : undefined,
      serviceIds: table.state.serviceIds.length > 0 ? table.state.serviceIds : undefined,
      employeeIds: table.state.employeeIds.length > 0 ? table.state.employeeIds : undefined,
      operationKind: (table.state.operationKind as StatisticsOperationKind) || undefined,
      effectiveState: (table.state.effectiveState as StatisticsEffectiveState) || undefined,
      validationStatus: (table.state.validationStatus as StatisticsValidationStatus) || undefined,
      locationStatus: table.state.locationStatus || undefined,
      punctualityStatus: table.state.punctualityStatus || undefined,
      incompleteCoverage: table.state.incompleteCoverage || undefined,
    }),
    [
      isoDateFrom,
      isoDateTo,
      table.state.employeeIds,
      table.state.incompleteCoverage,
      table.state.operationIds,
      table.state.operationKind,
      table.state.effectiveState,
      table.state.locationStatus,
      table.state.punctualityStatus,
      table.state.serviceIds,
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

  const activeTab = table.state.tab;
  const isGeneralTab = activeTab === "general";
  const isEmployeeTab = activeTab === "employee";
  const isOperationTab = activeTab === "operation";
  const isLocationTab = activeTab === "location";

  const attentionEmployeesFilters = useMemo(
    () => buildAttentionEmployeesFilters(baseFilters),
    [baseFilters],
  );
  const topLateEmployeeChartFilters = useMemo(
    () => buildTopLateEmployeesFilters(baseFilters),
    [baseFilters],
  );
  const lowCoverageOperationsFilters = useMemo(
    () => buildLowCoverageOperationsFilters(baseFilters),
    [baseFilters],
  );
  const incidentServicesFilters = useMemo(
    () => buildIncidentServicesFilters(baseFilters),
    [baseFilters],
  );

  const summaryQuery = useStatisticsSummary(baseFilters, { enabled: isGeneralTab });
  const timelineQuery = useStatisticsTimeline(baseFilters, { enabled: isGeneralTab });
  const employeeQuery = useStatisticsByEmployee(employeeFilters, { enabled: isEmployeeTab });
  const operationQuery = useStatisticsByOperation(operationFilters, { enabled: isOperationTab });
  const serviceQuery = useStatisticsByService(serviceFilters, { enabled: isLocationTab });
  const attentionEmployeesQuery = useStatisticsByEmployee(attentionEmployeesFilters, {
    enabled: isGeneralTab,
  });
  const topLateEmployeesQuery = useStatisticsByEmployee(topLateEmployeeChartFilters, {
    enabled: isGeneralTab,
  });
  const lowCoverageOperationsQuery = useStatisticsByOperation(lowCoverageOperationsFilters, {
    enabled: isGeneralTab,
  });
  const incidentServicesQuery = useStatisticsByService(incidentServicesFilters, {
    enabled: isGeneralTab,
  });

  const attentionEmployees = attentionEmployeesQuery.data?.data ?? [];
  const topLateEmployees = topLateEmployeesQuery.data?.data ?? [];
  const lowCoverageOperations = lowCoverageOperationsQuery.data?.data ?? [];
  const incidentServices = incidentServicesQuery.data?.data ?? [];

  const timeline = timelineQuery.data ?? [];
  const timelineOption = buildTimelineChartOption(
    timeline.map((point) => point.date),
    {
      attendanceRate: timeline.map((point) => point.attendanceRate ?? 0),
      punctualityRate: timeline.map((point) => point.punctualityRate ?? 0),
      scheduled: timeline.map((point) => point.scheduled),
      isPartial: timeline.map((point) => Boolean(point.isPartial)),
    },
  );

  const timelineExportRows = timeline.map((point) => [
    point.date,
    point.attendanceRate ?? "",
    point.punctualityRate ?? "",
    point.scheduled,
    point.present,
    point.absent,
    point.onTime,
    point.late,
    point.isPartial ? "parcial" : "consolidado",
  ]);

  const summary = summaryQuery.data;
  const actionExceptions = summary?.actionExceptions ?? [];
  const actionExceptionsOption = buildActionExceptionsOption(actionExceptions);
  const linkContext = useMemo<StatisticsDeepLinkContext>(
    () => ({
      dateFrom: isoDateFrom,
      dateTo: isoDateTo,
      operationIds: table.state.operationIds,
      serviceIds: table.state.serviceIds,
      employeeIds: table.state.employeeIds,
    }),
    [
      isoDateFrom,
      isoDateTo,
      table.state.employeeIds,
      table.state.operationIds,
      table.state.serviceIds,
    ],
  );

  const generatedAt = useMemo(() => new Date().toISOString(), [summary?.scheduledWorkdays, isoDateFrom, isoDateTo]);

  const summaryExportRows = summary
    ? [
        ["Rango desde", isoDateFrom ?? ""],
        ["Rango hasta", isoDateTo ?? ""],
        ["Generado en (UTC)", generatedAt],
        ["Zona horaria de la empresa", summary.companyTimeZone ?? ""],
        ["Fecha local de referencia", summary.companyLocalDate ?? ""],
        ["Jornadas programadas", summary.scheduledWorkdays],
        ["Jornadas requeridas", summary.attendanceRequiredWorkdays],
        ["Presentes", summary.presentWorkdays],
        ["Ausencias no justificadas", summary.absentWorkdays],
        ["Justificadas", summary.justifiedWorkdays],
        ["Pendientes / esperadas", summary.expectedOpenWorkdays],
        ["Canceladas", summary.cancelledWorkdays],
        [
          "Presentismo",
          `${formatPercent(summary.attendanceRate)} (${summary.presentWorkdays}/${summary.presentWorkdays + summary.absentWorkdays})`,
        ],
        [
          "Puntualidad",
          `${formatPercent(summary.punctualityRate)} (${summary.onTimeWorkdays}/${summary.onTimeWorkdays + summary.lateWorkdays})`,
        ],
        [
          "Cobertura",
          `${formatPercent(summary.coverageRate)} (${summary.presentWorkdays}/${summary.attendanceRequiredWorkdays})`,
        ],
        ["Operaciones con cobertura incompleta", summary.incompleteCoverageOperations],
        ["Llegadas tarde", summary.lateWorkdays],
        ["Salidas tempranas", summary.earlyDepartureWorkdays],
        ["Jornadas sin cierre", summary.openAttendanceWorkdays],
        ["Fuera de geocerca", summary.outsideGeofenceCount],
        ["Pendiente de revisión", summary.pendingReviewCount],
        ["Rechazadas", summary.rejectedCount],
        [
          "Horas trabajadas",
          summary.hoursDataIncomplete
            ? `${formatDurationFromMinutes(summary.workedMinutes)} (parcial)`
            : formatDurationFromMinutes(summary.workedMinutes),
        ],
        ["Horas extra", formatDurationFromMinutes(summary.overtimeMinutes)],
        [terminology.operation.plural, summary.totalOperations],
        ["Muestra mínima", summary.minSampleWorkdays ?? 3],
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
      row.displayLabel ?? row.operationId,
      operationKindLabels[row.operationKind as keyof typeof operationKindLabels] ?? row.operationKind,
      row.serviceName,
      row.serviceAddress ?? "",
      row.scheduledStart ? formatDateTime(row.scheduledStart) : "—",
      row.scheduledWorkdays,
      row.presentWorkdays,
      row.absentWorkdays,
      row.justifiedWorkdays,
      row.expectedOpenWorkdays,
      formatPercent(row.coverageRate ?? row.attendanceRate),
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
    activeTab,
    setActiveTab: (tab: StatisticsTabKey) => table.setField("tab", tab, { resetPage: false }),
    defaultDateRange,
    dateRange,
    setDateRange: (value: DateRangeValue) => table.setState(dateRangeToUrlFields(value)),
    operationIds: table.state.operationIds,
    setOperationIds: (value: string[]) => table.setField("operationIds", value),
    serviceIds: table.state.serviceIds,
    setServiceIds: (value: string[]) => table.setField("serviceIds", value),
    employeeIds: table.state.employeeIds,
    setEmployeeIds: (value: string[]) => table.setField("employeeIds", value),
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
    incompleteCoverage: table.state.incompleteCoverage,
    setIncompleteCoverage: (value: boolean) => table.setField("incompleteCoverage", value),
    exportsDisabled,
    isoDateFrom,
    isoDateTo,
    linkContext,
    resetAllPages,
    resetFilters: table.resetFilters,
    hasActiveFilters: table.hasActiveFilters,
    activeFilterCount: table.activeFilterCount,
    summaryQuery,
    timelineQuery,
    employeeQuery,
    operationQuery,
    serviceQuery,
    attentionEmployeesQuery,
    topLateEmployeesQuery,
    lowCoverageOperationsQuery,
    incidentServicesQuery,
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
    actionExceptions,
    actionExceptionsOption,
    attentionEmployees,
    topLateEmployees,
    lowCoverageOperations,
    incidentServices,
    loadWorkdayDetailExportRows,
    loadEmployeeExportRows,
    loadOperationExportRows,
    loadServiceExportRows,
  };
}

export type StatisticsPageData = ReturnType<typeof useStatisticsPageData>;
