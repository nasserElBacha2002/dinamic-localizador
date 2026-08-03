import type { StatisticsFilters, StatisticsTableQuery } from "../schemas/statistics.schema";
import { MAX_STATISTICS_EXPORT_ROWS } from "../schemas/statistics.schema";
import { statisticsRepository } from "../repositories/statistics.repository";
import { companyOperationalSettingsService } from "./company-operational-settings.service";
import type {
  AttendanceStatisticsPeriodComparison,
  AttendanceStatisticsSummary,
  AttendanceStatisticsSummaryPayload,
} from "../types/statistics";
import {
  buildNormalizedIncidentRate,
  buildRateDelta,
} from "../utils/attendance-statistics-metrics";
import { buildActionExceptions } from "../utils/statistics-action-exceptions";
import { buildPaginationMeta } from "../utils/pagination";
import { resolveOperationTimezone } from "../utils/operation-timezone";
import {
  buildStatisticsTimeContext,
  withPreviousPeriodFilters,
} from "../utils/statistics-period";

const resolvePagination = (query: StatisticsTableQuery) => {
  if (query.export) {
    return { page: 1, limit: MAX_STATISTICS_EXPORT_ROWS };
  }
  return { page: query.page, limit: query.limit };
};

const resolveTimeContext = async (companyId: string) => {
  const settings = await companyOperationalSettingsService.getCompanyOperationalSettings(companyId);
  const companyTimeZone = resolveOperationTimezone(settings?.operationTimezone);
  return buildStatisticsTimeContext(companyTimeZone);
};

const buildComparison = (
  current: AttendanceStatisticsSummary,
  previous: AttendanceStatisticsSummary,
  minSample: number,
): AttendanceStatisticsPeriodComparison => {
  const currentResolved = current.presentWorkdays + current.absentWorkdays;
  const previousResolved = previous.presentWorkdays + previous.absentWorkdays;
  const currentPunctuality = current.onTimeWorkdays + current.lateWorkdays;
  const previousPunctuality = previous.onTimeWorkdays + previous.lateWorkdays;
  const currentStarted = current.presentWorkdays;
  const previousStarted = previous.presentWorkdays;
  const currentLocation = current.locationEvaluableWorkdays || current.presentWorkdays;
  const previousLocation = previous.locationEvaluableWorkdays || previous.presentWorkdays;

  return {
    attendanceRate: buildRateDelta(
      current.attendanceRate,
      previous.attendanceRate,
      currentResolved,
      previousResolved,
      minSample,
    ),
    punctualityRate: buildRateDelta(
      current.punctualityRate,
      previous.punctualityRate,
      currentPunctuality,
      previousPunctuality,
      minSample,
    ),
    absenceRate: buildRateDelta(
      current.absenceRate,
      previous.absenceRate,
      currentResolved,
      previousResolved,
      minSample,
    ),
    openAttendanceRate: buildRateDelta(
      buildNormalizedIncidentRate(current.openAttendanceWorkdays, currentStarted),
      buildNormalizedIncidentRate(previous.openAttendanceWorkdays, previousStarted),
      currentStarted,
      previousStarted,
      minSample,
    ),
    outsideGeofenceRate: buildRateDelta(
      buildNormalizedIncidentRate(current.outsideGeofenceCount, currentLocation),
      buildNormalizedIncidentRate(previous.outsideGeofenceCount, previousLocation),
      currentLocation,
      previousLocation,
      minSample,
    ),
  };
};

const withExportMeta = (page: number, limit: number, total: number, isExport: boolean | undefined) => ({
  ...buildPaginationMeta(page, limit, total),
  truncated: Boolean(isExport && total > MAX_STATISTICS_EXPORT_ROWS),
  exportLimit: isExport ? MAX_STATISTICS_EXPORT_ROWS : undefined,
});

export const statisticsService = {
  async getSummary(companyId: string, filters: StatisticsFilters) {
    const time = await resolveTimeContext(companyId);
    const currentPromise = statisticsRepository.getSummary(
      companyId,
      filters,
      time.referenceAtUtc,
    );
    const previousFilters = withPreviousPeriodFilters(filters, time.companyTimeZone);
    const previousPromise = previousFilters
      ? statisticsRepository.getSummary(companyId, previousFilters, time.referenceAtUtc)
      : Promise.resolve(null);

    const [current, previousPeriod] = await Promise.all([currentPromise, previousPromise]);
    const comparison =
      previousPeriod != null
        ? buildComparison(current, previousPeriod, time.minSampleWorkdays)
        : null;

    const data: AttendanceStatisticsSummaryPayload = {
      ...current,
      previousPeriod,
      comparison,
      minSampleWorkdays: time.minSampleWorkdays,
      companyTimeZone: time.companyTimeZone,
      companyLocalDate: time.companyLocalDate,
      actionExceptions: buildActionExceptions(current),
    };

    return { data };
  },

  async getTimeline(companyId: string, filters: StatisticsFilters) {
    const time = await resolveTimeContext(companyId);
    const data = await statisticsRepository.getTimeline(
      companyId,
      filters,
      time.referenceAtUtc,
      time.companyLocalDate,
    );
    return { data };
  },

  async getStatusDistribution(companyId: string, filters: StatisticsFilters) {
    const time = await resolveTimeContext(companyId);
    const data = await statisticsRepository.getStatusDistribution(
      companyId,
      filters,
      time.referenceAtUtc,
    );
    return { data };
  },

  async getActionExceptions(companyId: string, filters: StatisticsFilters) {
    const time = await resolveTimeContext(companyId);
    const data = await statisticsRepository.getActionExceptions(
      companyId,
      filters,
      time.referenceAtUtc,
    );
    return { data };
  },

  async getByEmployee(companyId: string, query: StatisticsTableQuery) {
    const time = await resolveTimeContext(companyId);
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getByEmployee(
      companyId,
      query,
      page,
      limit,
      query.sortBy,
      query.sortDirection,
      time.referenceAtUtc,
    );
    return { data, meta: withExportMeta(page, limit, total, query.export) };
  },

  async getByOperation(companyId: string, query: StatisticsTableQuery) {
    const time = await resolveTimeContext(companyId);
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getByOperation(
      companyId,
      query,
      page,
      limit,
      query.sortBy,
      query.sortDirection,
      time.referenceAtUtc,
    );
    return { data, meta: withExportMeta(page, limit, total, query.export) };
  },

  async getByService(companyId: string, query: StatisticsTableQuery) {
    const time = await resolveTimeContext(companyId);
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getByService(
      companyId,
      query,
      page,
      limit,
      query.sortBy,
      query.sortDirection,
      time.referenceAtUtc,
    );
    return { data, meta: withExportMeta(page, limit, total, query.export) };
  },

  async getWorkdayDetails(companyId: string, query: StatisticsTableQuery) {
    const time = await resolveTimeContext(companyId);
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getWorkdayDetails(
      companyId,
      query,
      page,
      limit,
      time.referenceAtUtc,
    );
    return { data, meta: withExportMeta(page, limit, total, query.export) };
  },
};
