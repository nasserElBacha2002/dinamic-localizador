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

export const statisticsService = {
  async getSummary(companyId: string, filters: StatisticsFilters) {
    const data = await statisticsRepository.getSummary(companyId, filters);
    return { data };
  },

  async getTimeline(companyId: string, filters: StatisticsFilters) {
    const data = await statisticsRepository.getTimeline(companyId, filters);
    return { data };
  },

  async getStatusDistribution(companyId: string, filters: StatisticsFilters) {
    const data = await statisticsRepository.getStatusDistribution(companyId, filters);
    return { data };
  },

  async getByEmployee(companyId: string, query: StatisticsTableQuery) {
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getByEmployee(
      companyId,
      query,
      page,
      limit,
      query.sortBy,
      query.sortDirection,
    );

    return {
      data,
      meta: buildPaginationMeta(page, limit, total),
    };
  },

  async getByInventory(companyId: string, query: StatisticsTableQuery) {
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getByInventory(
      companyId,
      query,
      page,
      limit,
      query.sortBy,
      query.sortDirection,
    );

    return {
      data,
      meta: buildPaginationMeta(page, limit, total),
    };
  },

  async getByLocation(companyId: string, query: StatisticsTableQuery) {
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getByLocation(
      companyId,
      query,
      page,
      limit,
      query.sortBy,
      query.sortDirection,
    );

    return {
      data,
      meta: buildPaginationMeta(page, limit, total),
    };
  },
};
