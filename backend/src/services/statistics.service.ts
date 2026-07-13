import type { StatisticsFilters, StatisticsTableQuery } from "../schemas/statistics.schema";
import { MAX_STATISTICS_EXPORT_ROWS } from "../schemas/statistics.schema";
import { statisticsRepository } from "../repositories/statistics.repository";
import { buildPaginationMeta } from "../utils/pagination";

const resolvePagination = (query: StatisticsTableQuery) => {
  if (query.export) {
    return {
      page: 1,
      limit: MAX_STATISTICS_EXPORT_ROWS,
    };
  }

  return {
    page: query.page,
    limit: query.limit,
  };
};

const resolveReferenceAt = (): Date => new Date();

export const statisticsService = {
  async getSummary(companyId: string, filters: StatisticsFilters) {
    const referenceAt = resolveReferenceAt();
    const data = await statisticsRepository.getSummary(companyId, filters, referenceAt);
    return { data };
  },

  async getTimeline(companyId: string, filters: StatisticsFilters) {
    const referenceAt = resolveReferenceAt();
    const data = await statisticsRepository.getTimeline(companyId, filters, referenceAt);
    return { data };
  },

  async getStatusDistribution(companyId: string, filters: StatisticsFilters) {
    const referenceAt = resolveReferenceAt();
    const data = await statisticsRepository.getStatusDistribution(companyId, filters, referenceAt);
    return { data };
  },

  async getByEmployee(companyId: string, query: StatisticsTableQuery) {
    const referenceAt = resolveReferenceAt();
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getByEmployee(
      companyId,
      query,
      page,
      limit,
      query.sortBy,
      query.sortDirection,
      referenceAt,
    );

    return {
      data,
      meta: buildPaginationMeta(page, limit, total),
    };
  },

  async getByOperation(companyId: string, query: StatisticsTableQuery) {
    const referenceAt = resolveReferenceAt();
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getByOperation(
      companyId,
      query,
      page,
      limit,
      query.sortBy,
      query.sortDirection,
      referenceAt,
    );

    return {
      data,
      meta: buildPaginationMeta(page, limit, total),
    };
  },

  async getByService(companyId: string, query: StatisticsTableQuery) {
    const referenceAt = resolveReferenceAt();
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getByService(
      companyId,
      query,
      page,
      limit,
      query.sortBy,
      query.sortDirection,
      referenceAt,
    );

    return {
      data,
      meta: buildPaginationMeta(page, limit, total),
    };
  },

  async getWorkdayDetails(companyId: string, query: StatisticsTableQuery) {
    const referenceAt = resolveReferenceAt();
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getWorkdayDetails(
      companyId,
      query,
      page,
      limit,
      referenceAt,
    );

    return {
      data,
      meta: buildPaginationMeta(page, limit, total),
    };
  },
};
