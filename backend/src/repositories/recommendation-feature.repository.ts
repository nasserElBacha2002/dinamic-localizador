import sql from "mssql";
import { getPool } from "../database/connection";

export interface RecommendationCandidateRow {
  employeeId: string;
  name: string;
  employeeType: string;
  categoryId: string | null;
  categoryName: string | null;
  centroidLatitude: number | null;
  centroidLongitude: number | null;
}

export interface AffinityPairRow {
  candidateId: string;
  assignedEmployeeId: string;
  sharedOccurrences: number;
  lastSharedAt: string | null;
  recent90: number;
  mid365: number;
  older: number;
}

export interface ServiceExperienceRow {
  employeeId: string;
  serviceWorkdayCount: number;
}

const bindUuidList = (
  request: sql.Request,
  prefix: string,
  ids: string[],
): string => {
  if (ids.length === 0) {
    return "";
  }
  return ids
    .map((id, index) => {
      const name = `${prefix}${index}`;
      request.input(name, sql.UniqueIdentifier, id);
      return `@${name}`;
    })
    .join(", ");
};

/**
 * Historical co-occurrence semantic (V1):
 * Same ACTIVE operation_workday, non-cancelled employee expectations,
 * work_date strictly before @referenceDate (excludes future-only),
 * and assignment still covering that work_date when linked.
 *
 * This is scheduled co-presence on an effective workday — not attendance PRESENT.
 */
const HISTORICAL_EMPLOYEE_WORKDAY_CTE = `
  historical_ew AS (
    SELECT
      ew.employee_id,
      ew.operation_workday_id,
      ow.work_date
    FROM employee_workdays ew
    INNER JOIN operation_workdays ow
      ON ow.id = ew.operation_workday_id
     AND ow.company_id = ew.company_id
    WHERE ew.company_id = @companyId
      AND ew.expectation_status <> N'CANCELLED'
      AND ow.status = N'ACTIVE'
      AND ow.work_date < @referenceDate
      AND (
        ew.operation_assignment_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM operation_assignments oa
          WHERE oa.id = ew.operation_assignment_id
            AND oa.company_id = ew.company_id
            AND oa.cancelled_at IS NULL
            AND ow.work_date >= oa.valid_from
            AND (oa.valid_until IS NULL OR ow.work_date <= oa.valid_until)
        )
      )
  )
`;

export const recommendationFeatureRepository = {
  async listEligibleCandidates(
    companyId: string,
    excludedEmployeeIds: string[],
  ): Promise<RecommendationCandidateRow[]> {
    const request = getPool().request().input("companyId", sql.UniqueIdentifier, companyId);

    let excludedClause = "";
    if (excludedEmployeeIds.length > 0) {
      const params = bindUuidList(request, "ex", excludedEmployeeIds);
      excludedClause = `AND e.id NOT IN (${params})`;
    }

    const result = await request.query(`
      SELECT
        e.id AS employee_id,
        e.name AS name,
        e.employee_type AS employee_type,
        e.category_id AS category_id,
        ec.name AS category_name,
        lz.centroid_latitude AS centroid_latitude,
        lz.centroid_longitude AS centroid_longitude
      FROM employees e
      LEFT JOIN employee_categories ec
        ON ec.id = e.category_id
       AND (ec.company_id IS NULL OR ec.company_id = e.company_id)
      LEFT JOIN location_zones lz
        ON lz.id = e.location_zone_id
       AND lz.company_id = e.company_id
      WHERE e.company_id = @companyId
        AND e.active = 1
        ${excludedClause}
      ORDER BY e.id ASC
    `);

    return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
      employeeId: String(row.employee_id),
      name: String(row.name),
      employeeType: String(row.employee_type),
      categoryId: row.category_id ? String(row.category_id) : null,
      categoryName: row.category_name ? String(row.category_name) : null,
      centroidLatitude:
        row.centroid_latitude === null || row.centroid_latitude === undefined
          ? null
          : Number(row.centroid_latitude),
      centroidLongitude:
        row.centroid_longitude === null || row.centroid_longitude === undefined
          ? null
          : Number(row.centroid_longitude),
    }));
  },

  async listAffinityPairs(input: {
    companyId: string;
    assignedEmployeeIds: string[];
    candidateEmployeeIds: string[];
    referenceDate: string;
  }): Promise<AffinityPairRow[]> {
    if (input.assignedEmployeeIds.length === 0 || input.candidateEmployeeIds.length === 0) {
      return [];
    }

    const request = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("referenceDate", sql.Date, input.referenceDate);

    const assignedParams = bindUuidList(request, "asg", input.assignedEmployeeIds);
    const candidateParams = bindUuidList(request, "cand", input.candidateEmployeeIds);

    const result = await request.query(`
      WITH ${HISTORICAL_EMPLOYEE_WORKDAY_CTE}
      SELECT
        cand.employee_id AS candidate_id,
        asg.employee_id AS assigned_employee_id,
        COUNT_BIG(*) AS shared_occurrences,
        CONVERT(varchar(10), MAX(cand.work_date), 23) AS last_shared_at,
        SUM(CASE WHEN DATEDIFF(day, cand.work_date, @referenceDate) <= 90 THEN 1 ELSE 0 END) AS recent_90,
        SUM(
          CASE
            WHEN DATEDIFF(day, cand.work_date, @referenceDate) BETWEEN 91 AND 365 THEN 1
            ELSE 0
          END
        ) AS mid_365,
        SUM(CASE WHEN DATEDIFF(day, cand.work_date, @referenceDate) > 365 THEN 1 ELSE 0 END) AS older
      FROM historical_ew cand
      INNER JOIN historical_ew asg
        ON asg.operation_workday_id = cand.operation_workday_id
       AND asg.employee_id <> cand.employee_id
      WHERE cand.employee_id IN (${candidateParams})
        AND asg.employee_id IN (${assignedParams})
      GROUP BY cand.employee_id, asg.employee_id
    `);

    return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
      candidateId: String(row.candidate_id),
      assignedEmployeeId: String(row.assigned_employee_id),
      sharedOccurrences: Number(row.shared_occurrences),
      lastSharedAt: row.last_shared_at ? String(row.last_shared_at).slice(0, 10) : null,
      recent90: Number(row.recent_90),
      mid365: Number(row.mid_365),
      older: Number(row.older),
    }));
  },

  async listServiceExperience(input: {
    companyId: string;
    serviceId: string;
    candidateEmployeeIds: string[];
    referenceDate: string;
    excludeOperationId: string;
  }): Promise<ServiceExperienceRow[]> {
    if (input.candidateEmployeeIds.length === 0) {
      return [];
    }

    const request = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("serviceId", sql.UniqueIdentifier, input.serviceId)
      .input("referenceDate", sql.Date, input.referenceDate)
      .input("excludeOperationId", sql.UniqueIdentifier, input.excludeOperationId);

    const candidateParams = bindUuidList(request, "cand", input.candidateEmployeeIds);

    const result = await request.query(`
      SELECT
        ew.employee_id AS employee_id,
        COUNT(DISTINCT ow.id) AS service_workday_count
      FROM employee_workdays ew
      INNER JOIN operation_workdays ow
        ON ow.id = ew.operation_workday_id
       AND ow.company_id = ew.company_id
      INNER JOIN scheduled_operations so
        ON so.id = ow.operation_id
       AND so.company_id = ew.company_id
      WHERE ew.company_id = @companyId
        AND so.service_id = @serviceId
        AND so.id <> @excludeOperationId
        AND ew.employee_id IN (${candidateParams})
        AND ew.expectation_status <> N'CANCELLED'
        AND ow.status = N'ACTIVE'
        AND ow.work_date < @referenceDate
        AND (
          ew.operation_assignment_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM operation_assignments oa
            WHERE oa.id = ew.operation_assignment_id
              AND oa.company_id = ew.company_id
              AND oa.cancelled_at IS NULL
              AND ow.work_date >= oa.valid_from
              AND (oa.valid_until IS NULL OR ow.work_date <= oa.valid_until)
          )
        )
      GROUP BY ew.employee_id
    `);

    return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
      employeeId: String(row.employee_id),
      serviceWorkdayCount: Number(row.service_workday_count),
    }));
  },
};
