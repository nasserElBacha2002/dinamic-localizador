import sql from "mssql";
import { getPool } from "../../database/connection";
import { assertValidBatchId, buildBatchMarker } from "./markers";

export interface CleanupSeedResult {
  attendanceDeleted: number;
  employeeWorkdaysDeleted: number;
  assignmentsDeleted: number;
  workdaysDeleted: number;
  operationsDeleted: number;
  workTeamMembersDeleted: number;
  workTeamsDeleted: number;
}

/** Literal substring match — never LIKE (avoids [] % _ semantics). */
export const seedBatchMarkerSqlPredicate = (columnSql: string): string =>
  `CHARINDEX(@marker, ${columnSql}) > 0`;

const countSeedChildren = async (
  companyId: string,
  operationIds: string[],
  workTeamIds: string[],
): Promise<CleanupSeedResult> => {
  const pool = getPool();
  let attendance = 0;
  let employeeWorkdays = 0;
  let assignments = 0;
  let workdays = 0;
  let members = 0;

  if (operationIds.length > 0) {
    const json = JSON.stringify(operationIds);
    const counts = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("idsJson", sql.NVarChar(sql.MAX), json)
      .query(`
        SELECT
          (SELECT COUNT(*) FROM attendance_records ar
           WHERE ar.company_id = @companyId
             AND ar.operation_id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@idsJson))
          ) AS attendance_cnt,
          (SELECT COUNT(*) FROM employee_workdays ew
           INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
           WHERE ew.company_id = @companyId
             AND ow.operation_id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@idsJson))
          ) AS ew_cnt,
          (SELECT COUNT(*) FROM operation_assignments oa
           WHERE oa.company_id = @companyId
             AND oa.operation_id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@idsJson))
          ) AS asg_cnt,
          (SELECT COUNT(*) FROM operation_workdays ow
           WHERE ow.company_id = @companyId
             AND ow.operation_id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@idsJson))
          ) AS wd_cnt
      `);
    attendance = Number(counts.recordset[0].attendance_cnt);
    employeeWorkdays = Number(counts.recordset[0].ew_cnt);
    assignments = Number(counts.recordset[0].asg_cnt);
    workdays = Number(counts.recordset[0].wd_cnt);
  }

  if (workTeamIds.length > 0) {
    const json = JSON.stringify(workTeamIds);
    const m = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("idsJson", sql.NVarChar(sql.MAX), json)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM work_team_members
        WHERE company_id = @companyId
          AND work_team_id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@idsJson))
      `);
    members = Number(m.recordset[0].cnt);
  }

  return {
    attendanceDeleted: attendance,
    employeeWorkdaysDeleted: employeeWorkdays,
    assignmentsDeleted: assignments,
    workdaysDeleted: workdays,
    operationsDeleted: operationIds.length,
    workTeamMembersDeleted: members,
    workTeamsDeleted: workTeamIds.length,
  };
};

export const listSeedOperationIdsByBatch = async (
  companyId: string,
  batchId: string,
): Promise<string[]> => {
  const marker = buildBatchMarker(batchId);
  const result = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("marker", sql.NVarChar(200), marker)
    .query(`
      SELECT id FROM scheduled_operations
      WHERE company_id = @companyId
        AND notes IS NOT NULL
        AND ${seedBatchMarkerSqlPredicate("notes")}
    `);
  return (result.recordset as Array<{ id: string }>).map((r) => String(r.id));
};

export const listSeedWorkTeamIdsByBatch = async (
  companyId: string,
  batchId: string,
): Promise<string[]> => {
  const marker = buildBatchMarker(batchId);
  const result = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("marker", sql.NVarChar(200), marker)
    .query(`
      SELECT id FROM work_teams
      WHERE company_id = @companyId
        AND description IS NOT NULL
        AND ${seedBatchMarkerSqlPredicate("description")}
    `);
  return (result.recordset as Array<{ id: string }>).map((r) => String(r.id));
};

/**
 * Deletes only synthetic rows tagged with the exact batch marker.
 * Does not modify employees or services.
 */
export const cleanupHistoricalSeed = async (
  companyId: string,
  batchId: string,
  options: { dryRun: boolean } = { dryRun: false },
): Promise<CleanupSeedResult> => {
  assertValidBatchId(batchId);
  const pool = getPool();
  const operationIds = await listSeedOperationIdsByBatch(companyId, batchId);
  const workTeamIds = await listSeedWorkTeamIdsByBatch(companyId, batchId);

  const preview = await countSeedChildren(companyId, operationIds, workTeamIds);
  if (options.dryRun) {
    return preview;
  }

  const transaction = new sql.Transaction(pool);
  await transaction.begin();
  try {
    if (operationIds.length > 0) {
      const json = JSON.stringify(operationIds);
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("idsJson", sql.NVarChar(sql.MAX), json)
        .query(`
          DELETE FROM attendance_records
          WHERE company_id = @companyId
            AND operation_id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@idsJson));

          DELETE ew
          FROM employee_workdays ew
          INNER JOIN operation_workdays ow ON ow.id = ew.operation_workday_id
          WHERE ew.company_id = @companyId
            AND ow.operation_id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@idsJson));

          DELETE FROM operation_assignments
          WHERE company_id = @companyId
            AND operation_id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@idsJson));

          DELETE FROM operation_workdays
          WHERE company_id = @companyId
            AND operation_id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@idsJson));

          DELETE FROM scheduled_operations
          WHERE company_id = @companyId
            AND id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@idsJson));
        `);
    }

    if (workTeamIds.length > 0) {
      const json = JSON.stringify(workTeamIds);
      await new sql.Request(transaction)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("idsJson", sql.NVarChar(sql.MAX), json)
        .query(`
          DELETE FROM work_team_members
          WHERE company_id = @companyId
            AND work_team_id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@idsJson));

          DELETE FROM work_teams
          WHERE company_id = @companyId
            AND id IN (SELECT TRY_CAST([value] AS UNIQUEIDENTIFIER) FROM OPENJSON(@idsJson));
        `);
    }

    await transaction.commit();
    return preview;
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
