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
  async getSummary(filters: StatisticsFilters) {
    const data = await statisticsRepository.getSummary(filters);
    return { data };
  },

  async getTimeline(filters: StatisticsFilters) {
    const data = await statisticsRepository.getTimeline(filters);
    return { data };
  },

  async getStatusDistribution(filters: StatisticsFilters) {
    const data = await statisticsRepository.getStatusDistribution(filters);
    return { data };
  },

  async getByEmployee(query: StatisticsTableQuery) {
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getByEmployee(
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

  async getByInventory(query: StatisticsTableQuery) {
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getByInventory(
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

  async getByLocation(query: StatisticsTableQuery) {
    const { page, limit } = resolvePagination(query);
    const { data, total } = await statisticsRepository.getByLocation(
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
