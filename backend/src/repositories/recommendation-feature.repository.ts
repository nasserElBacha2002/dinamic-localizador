import sql from "mssql";
import { WORKFORCE_RECOMMENDATION_V1_RECENCY } from "../constants/workforce-recommendation-v1";
import { getPool } from "../database/connection";

export interface RecommendationCandidateRow {
  employeeId: string;
  name: string;
  employeeType: string;
  categoryId: string | null;
  categoryName: string | null;
  locationZoneId: string | null;
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

export interface CandidatePairAffinityRow {
  employeeAId: string;
  employeeBId: string;
  sharedOccurrences: number;
  lastSharedAt: string | null;
  recent90: number;
  mid365: number;
  older: number;
}

const uuidJsonParam = (ids: string[]): string => JSON.stringify(ids);

/**
 * Historical co-occurrence semantic (V1):
 * Same ACTIVE operation_workday, non-cancelled employee expectations,
 * work_date strictly before @historyCutoffDate (never counts future-as-of-today),
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
      AND ow.work_date < @historyCutoffDate
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
    const request = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("excludedIdsJson", sql.NVarChar(sql.MAX), uuidJsonParam(excludedEmployeeIds));

    const result = await request.query(`
      SELECT
        e.id AS employee_id,
        e.name AS name,
        e.employee_type AS employee_type,
        e.category_id AS category_id,
        ec.name AS category_name,
        e.location_zone_id AS location_zone_id,
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
        AND NOT EXISTS (
          SELECT 1
          FROM OPENJSON(@excludedIdsJson) j
          WHERE TRY_CAST(j.[value] AS UNIQUEIDENTIFIER) = e.id
        )
      ORDER BY e.id ASC
    `);

    return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
      employeeId: String(row.employee_id),
      name: String(row.name),
      employeeType: String(row.employee_type),
      categoryId: row.category_id ? String(row.category_id) : null,
      categoryName: row.category_name ? String(row.category_name) : null,
      locationZoneId: row.location_zone_id ? String(row.location_zone_id) : null,
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

  /**
   * Active employees by id (same projection as eligibility list, including zone centroids).
   * Used for locked / already-assigned members that are excluded from the candidate pool.
   */
  async listCandidatesByIds(
    companyId: string,
    employeeIds: string[],
  ): Promise<RecommendationCandidateRow[]> {
    if (employeeIds.length === 0) {
      return [];
    }

    const request = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("idsJson", sql.NVarChar(sql.MAX), uuidJsonParam(employeeIds));

    const result = await request.query(`
      SELECT
        e.id AS employee_id,
        e.name AS name,
        e.employee_type AS employee_type,
        e.category_id AS category_id,
        ec.name AS category_name,
        e.location_zone_id AS location_zone_id,
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
        AND EXISTS (
          SELECT 1
          FROM OPENJSON(@idsJson) j
          WHERE TRY_CAST(j.[value] AS UNIQUEIDENTIFIER) = e.id
        )
      ORDER BY e.id ASC
    `);

    return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
      employeeId: String(row.employee_id),
      name: String(row.name),
      employeeType: String(row.employee_type),
      categoryId: row.category_id ? String(row.category_id) : null,
      categoryName: row.category_name ? String(row.category_name) : null,
      locationZoneId: row.location_zone_id ? String(row.location_zone_id) : null,
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

  /**
   * Affinity pairs for all active non-assigned employees vs assigned set.
   * Candidate IDs are derived set-based (no per-candidate SQL parameters).
   */
  async listAffinityPairs(input: {
    companyId: string;
    assignedEmployeeIds: string[];
    historyCutoffDate: string;
    todayDate: string;
  }): Promise<AffinityPairRow[]> {
    if (input.assignedEmployeeIds.length === 0) {
      return [];
    }

    const request = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("historyCutoffDate", sql.Date, input.historyCutoffDate)
      .input("todayDate", sql.Date, input.todayDate)
      .input("recentDays", sql.Int, WORKFORCE_RECOMMENDATION_V1_RECENCY.recentDays)
      .input("midDays", sql.Int, WORKFORCE_RECOMMENDATION_V1_RECENCY.midDays)
      .input("assignedIdsJson", sql.NVarChar(sql.MAX), uuidJsonParam(input.assignedEmployeeIds));

    const result = await request.query(`
      WITH assigned AS (
        SELECT DISTINCT TRY_CAST([value] AS UNIQUEIDENTIFIER) AS employee_id
        FROM OPENJSON(@assignedIdsJson)
        WHERE TRY_CAST([value] AS UNIQUEIDENTIFIER) IS NOT NULL
      ),
      ${HISTORICAL_EMPLOYEE_WORKDAY_CTE}
      SELECT
        cand.employee_id AS candidate_id,
        asg.employee_id AS assigned_employee_id,
        COUNT_BIG(*) AS shared_occurrences,
        CONVERT(varchar(10), MAX(cand.work_date), 23) AS last_shared_at,
        SUM(
          CASE WHEN DATEDIFF(day, cand.work_date, @todayDate) <= @recentDays THEN 1 ELSE 0 END
        ) AS recent_90,
        SUM(
          CASE
            WHEN DATEDIFF(day, cand.work_date, @todayDate) > @recentDays
             AND DATEDIFF(day, cand.work_date, @todayDate) <= @midDays
            THEN 1
            ELSE 0
          END
        ) AS mid_365,
        SUM(
          CASE WHEN DATEDIFF(day, cand.work_date, @todayDate) > @midDays THEN 1 ELSE 0 END
        ) AS older
      FROM historical_ew cand
      INNER JOIN historical_ew asg
        ON asg.operation_workday_id = cand.operation_workday_id
       AND asg.employee_id <> cand.employee_id
      INNER JOIN assigned a
        ON a.employee_id = asg.employee_id
      INNER JOIN employees e
        ON e.id = cand.employee_id
       AND e.company_id = @companyId
       AND e.active = 1
      WHERE NOT EXISTS (
        SELECT 1 FROM assigned x WHERE x.employee_id = cand.employee_id
      )
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
    excludedEmployeeIds: string[];
    historyCutoffDate: string;
    /** When set, exclude workdays from this operation (current op must not count as history). */
    excludeOperationId?: string | null;
  }): Promise<ServiceExperienceRow[]> {
    const request = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("serviceId", sql.UniqueIdentifier, input.serviceId)
      .input("historyCutoffDate", sql.Date, input.historyCutoffDate)
      .input(
        "excludeOperationId",
        sql.UniqueIdentifier,
        input.excludeOperationId ?? null,
      )
      .input("excludedIdsJson", sql.NVarChar(sql.MAX), uuidJsonParam(input.excludedEmployeeIds));

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
      INNER JOIN employees e
        ON e.id = ew.employee_id
       AND e.company_id = @companyId
       AND e.active = 1
      WHERE ew.company_id = @companyId
        AND so.service_id = @serviceId
        AND (@excludeOperationId IS NULL OR so.id <> @excludeOperationId)
        AND ew.expectation_status <> N'CANCELLED'
        AND ow.status = N'ACTIVE'
        AND ow.work_date < @historyCutoffDate
        AND NOT EXISTS (
          SELECT 1
          FROM OPENJSON(@excludedIdsJson) j
          WHERE TRY_CAST(j.[value] AS UNIQUEIDENTIFIER) = ew.employee_id
        )
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

  /**
   * Sparse candidate↔candidate co-occurrence matrix (only pairs that shared a workday).
   * Never materializes the full N² Cartesian product.
   */
  async listCandidatePairAffinity(input: {
    companyId: string;
    candidateIds: string[];
    historyCutoffDate: string;
    todayDate: string;
  }): Promise<CandidatePairAffinityRow[]> {
    if (input.candidateIds.length < 2) {
      return [];
    }

    const request = getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("historyCutoffDate", sql.Date, input.historyCutoffDate)
      .input("todayDate", sql.Date, input.todayDate)
      .input("recentDays", sql.Int, WORKFORCE_RECOMMENDATION_V1_RECENCY.recentDays)
      .input("midDays", sql.Int, WORKFORCE_RECOMMENDATION_V1_RECENCY.midDays)
      .input("candidateIdsJson", sql.NVarChar(sql.MAX), uuidJsonParam(input.candidateIds));

    const result = await request.query(`
      WITH candidates AS (
        SELECT DISTINCT TRY_CAST([value] AS UNIQUEIDENTIFIER) AS employee_id
        FROM OPENJSON(@candidateIdsJson)
        WHERE TRY_CAST([value] AS UNIQUEIDENTIFIER) IS NOT NULL
      ),
      ${HISTORICAL_EMPLOYEE_WORKDAY_CTE}
      SELECT
        left_ew.employee_id AS employee_a_id,
        right_ew.employee_id AS employee_b_id,
        COUNT_BIG(*) AS shared_occurrences,
        CONVERT(varchar(10), MAX(left_ew.work_date), 23) AS last_shared_at,
        SUM(
          CASE WHEN DATEDIFF(day, left_ew.work_date, @todayDate) <= @recentDays THEN 1 ELSE 0 END
        ) AS recent_90,
        SUM(
          CASE
            WHEN DATEDIFF(day, left_ew.work_date, @todayDate) > @recentDays
             AND DATEDIFF(day, left_ew.work_date, @todayDate) <= @midDays
            THEN 1
            ELSE 0
          END
        ) AS mid_365,
        SUM(
          CASE WHEN DATEDIFF(day, left_ew.work_date, @todayDate) > @midDays THEN 1 ELSE 0 END
        ) AS older
      FROM historical_ew left_ew
      INNER JOIN candidates c_left
        ON c_left.employee_id = left_ew.employee_id
      INNER JOIN historical_ew right_ew
        ON right_ew.operation_workday_id = left_ew.operation_workday_id
       AND CAST(left_ew.employee_id AS varchar(36)) < CAST(right_ew.employee_id AS varchar(36))
      INNER JOIN candidates c_right
        ON c_right.employee_id = right_ew.employee_id
      GROUP BY left_ew.employee_id, right_ew.employee_id
    `);

    return (result.recordset as Array<Record<string, unknown>>).map((row) => ({
      employeeAId: String(row.employee_a_id),
      employeeBId: String(row.employee_b_id),
      sharedOccurrences: Number(row.shared_occurrences),
      lastSharedAt: row.last_shared_at ? String(row.last_shared_at).slice(0, 10) : null,
      recent90: Number(row.recent_90),
      mid365: Number(row.mid_365),
      older: Number(row.older),
    }));
  },
};
