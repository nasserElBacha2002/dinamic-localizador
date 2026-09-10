import type { StatisticsFilters, StatisticsTableQuery } from "../schemas/statistics.schema";
import { operationalIncidentSummaryRepository } from "./operational-incident-summary.repository";
import { operationalIncidentDetailsRepository } from "./operational-incident-details.repository";

/**
 * Thin facade re-exporting summary + detail repositories for service compatibility.
 */
export const operationalIncidentStatisticsRepository = {
  getSummaryMetrics(
    companyId: string,
    filters: StatisticsFilters,
    referenceAt: Date,
    companyTimeZone: string,
  ) {
    return operationalIncidentSummaryRepository.getSummaryMetrics(
      companyId,
      filters,
      referenceAt,
      companyTimeZone,
    );
  },

  getIncidentDetails(
    companyId: string,
    query: StatisticsTableQuery,
    referenceAt: Date,
    companyTimeZone: string,
  ) {
    return operationalIncidentDetailsRepository.getIncidentDetails(
      companyId,
      query,
      referenceAt,
      companyTimeZone,
    );
  },
};
