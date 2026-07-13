import sql from "mssql";
import { randomUUID } from "node:crypto";
import { getPool } from "../database/connection";
import type { ListWorkTeamsQuery } from "../schemas/work-team.schema";
import type { WorkTeam, WorkTeamMember } from "../types/work-team";
import { applySqlFilters, buildWhereClause, type SqlFilter } from "../utils/sql-list-query";
import { mapEmployeeRow } from "../utils/row-mappers";

const mapWorkTeamRow = (row: Record<string, unknown>): WorkTeam => ({
  id: String(row.id),
  companyId: String(row.company_id),
  name: String(row.name),
  normalizedName: String(row.normalized_name),
  description: row.description ? String(row.description) : null,
  isActive: Boolean(row.is_active),
  createdAt: new Date(row.created_at as Date | string).toISOString(),
  updatedAt: new Date(row.updated_at as Date | string).toISOString(),
  createdBy: row.created_by ? String(row.created_by) : null,
  updatedBy: row.updated_by ? String(row.updated_by) : null,
  memberCount: row.member_count !== undefined ? Number(row.member_count) : undefined,
  activeMemberCount:
    row.active_member_count !== undefined ? Number(row.active_member_count) : undefined,
  usageCount: row.usage_count !== undefined ? Number(row.usage_count) : undefined,
  assignmentVersion:
    row.assignment_version !== undefined ? Number(row.assignment_version) : undefined,
});

const mapWorkTeamMemberRow = (row: Record<string, unknown>): WorkTeamMember => ({
  workTeamId: String(row.work_team_id),
  employeeId: String(row.employee_id),
  createdAt: new Date(row.created_at as Date | string).toISOString(),
  createdBy: row.created_by ? String(row.created_by) : null,
  employee: row.employee_name
    ? mapEmployeeRow({
        id: row.employee_id,
        name: row.employee_name,
        document_number: row.employee_document_number,
        phone_number: row.employee_phone_number,
        employee_type: row.employee_type,
        active: row.employee_active,
        created_at: row.employee_created_at,
        updated_at: row.employee_updated_at,
      })
    : undefined,
});

const isDuplicateNameError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.message.includes("UQ_work_teams_company_id_normalized_name");
};

const memberCountSelect = `
  (SELECT COUNT(*) FROM work_team_members wtm WHERE wtm.work_team_id = wt.id) AS member_count,
  (
    SELECT COUNT(*)
    FROM work_team_members wtm
    INNER JOIN employees e ON e.id = wtm.employee_id AND e.company_id = @companyId
    WHERE wtm.work_team_id = wt.id AND e.active = 1
  ) AS active_member_count,
  (
    SELECT COUNT(DISTINCT bt.batch_id)
    FROM work_team_assignment_batch_teams bt
    INNER JOIN work_team_assignment_batches b ON b.id = bt.batch_id AND b.company_id = @companyId
    WHERE bt.work_team_id = wt.id AND b.status = N'COMPLETED'
  ) AS usage_count
`;

export const workTeamRepository = {
  async create(
    companyId: string,
    input: {
      name: string;
      normalizedName: string;
      description: string | null;
      createdBy: string | null;
    },
    transaction?: sql.Transaction,
  ): Promise<WorkTeam> {
    const id = randomUUID();
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    try {
      const result = await request
        .input("id", sql.UniqueIdentifier, id)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .input("name", sql.NVarChar(200), input.name)
        .input("normalizedName", sql.NVarChar(200), input.normalizedName)
        .input("description", sql.NVarChar(500), input.description)
        .input("createdBy", sql.UniqueIdentifier, input.createdBy)
        .input("updatedBy", sql.UniqueIdentifier, input.createdBy)
        .query(`
          INSERT INTO work_teams (
            id, company_id, name, normalized_name, description, created_by, updated_by
          )
          OUTPUT INSERTED.*
          VALUES (
            @id, @companyId, @name, @normalizedName, @description, @createdBy, @updatedBy
          )
        `);
      return mapWorkTeamRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateNameError(error)) {
        throw Object.assign(new Error("WORK_TEAM_NAME_ALREADY_EXISTS"), {
          code: "WORK_TEAM_NAME_ALREADY_EXISTS",
        });
      }
      throw error;
    }
  },

  async findById(companyId: string, workTeamId: string): Promise<WorkTeam | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("workTeamId", sql.UniqueIdentifier, workTeamId)
      .query(`
        SELECT wt.*, ${memberCountSelect}
        FROM work_teams wt
        WHERE wt.id = @workTeamId AND wt.company_id = @companyId
      `);

    if (!result.recordset[0]) {
      return null;
    }
    return mapWorkTeamRow(result.recordset[0] as Record<string, unknown>);
  },

  async findByNormalizedName(
    companyId: string,
    normalizedName: string,
    excludeId?: string,
  ): Promise<WorkTeam | null> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("normalizedName", sql.NVarChar(200), normalizedName);

    if (excludeId) {
      request.input("excludeId", sql.UniqueIdentifier, excludeId);
    }

    const result = await request.query(`
      SELECT TOP 1 *
      FROM work_teams
      WHERE company_id = @companyId
        AND normalized_name = @normalizedName
        ${excludeId ? "AND id <> @excludeId" : ""}
    `);

    if (!result.recordset[0]) {
      return null;
    }
    return mapWorkTeamRow(result.recordset[0] as Record<string, unknown>);
  },

  async list(
    companyId: string,
    query: ListWorkTeamsQuery,
  ): Promise<{ items: WorkTeam[]; total: number }> {
    const pool = getPool();
    const filters: SqlFilter[] = [
      {
        clause: "wt.company_id = @companyId",
        apply: (request) => request.input("companyId", sql.UniqueIdentifier, companyId),
      },
    ];

    if (query.active !== undefined) {
      filters.push({
        clause: "wt.is_active = @active",
        apply: (request) => request.input("active", sql.Bit, query.active ? 1 : 0),
      });
    }

    if (query.search) {
      filters.push({
        clause: "(wt.name LIKE @search OR wt.description LIKE @search)",
        apply: (request) => request.input("search", sql.NVarChar(210), `%${query.search}%`),
      });
    }

    const whereClause = buildWhereClause(filters);
    const sortColumn =
      query.sortBy === "name"
        ? "wt.name"
        : query.sortBy === "memberCount"
          ? "member_count"
          : query.sortBy === "activeMemberCount"
            ? "active_member_count"
            : "wt.updated_at";
    const sortDirection = query.sortDirection === "asc" ? "ASC" : "DESC";
    const offset = (query.page - 1) * query.limit;

    const countRequest = pool.request();
    applySqlFilters(countRequest, filters);
    const countResult = await countRequest.query(`
      SELECT COUNT(*) AS total
      FROM work_teams wt
      ${whereClause}
    `);

    const listRequest = pool.request();
    applySqlFilters(listRequest, filters);
    listRequest.input("offset", sql.Int, offset).input("limit", sql.Int, query.limit);

    const listResult = await listRequest.query(`
      SELECT wt.*, ${memberCountSelect}
      FROM work_teams wt
      ${whereClause}
      ORDER BY ${sortColumn} ${sortDirection}, wt.name ASC
      OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
    `);

    return {
      items: listResult.recordset.map((row) => mapWorkTeamRow(row as Record<string, unknown>)),
      total: Number(countResult.recordset[0]?.total ?? 0),
    };
  },

  async update(
    companyId: string,
    workTeamId: string,
    input: {
      name?: string;
      normalizedName?: string;
      description?: string | null;
      isActive?: boolean;
      updatedBy: string | null;
    },
  ): Promise<WorkTeam | null> {
    const pool = getPool();
    const fields: string[] = ["updated_at = SYSUTCDATETIME()", "updated_by = @updatedBy"];
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("workTeamId", sql.UniqueIdentifier, workTeamId)
      .input("updatedBy", sql.UniqueIdentifier, input.updatedBy);

    if (input.name !== undefined) {
      fields.push("name = @name");
      request.input("name", sql.NVarChar(200), input.name);
    }
    if (input.normalizedName !== undefined) {
      fields.push("normalized_name = @normalizedName");
      request.input("normalizedName", sql.NVarChar(200), input.normalizedName);
    }
    if (input.description !== undefined) {
      fields.push("description = @description");
      request.input("description", sql.NVarChar(500), input.description);
    }
    if (input.isActive !== undefined) {
      fields.push("is_active = @isActive");
      request.input("isActive", sql.Bit, input.isActive ? 1 : 0);
    }

    try {
      const result = await request.query(`
        UPDATE work_teams
        SET ${fields.join(", ")}
        OUTPUT INSERTED.*
        WHERE id = @workTeamId AND company_id = @companyId
      `);

      if (!result.recordset[0]) {
        return null;
      }
      return mapWorkTeamRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateNameError(error)) {
        throw Object.assign(new Error("WORK_TEAM_NAME_ALREADY_EXISTS"), {
          code: "WORK_TEAM_NAME_ALREADY_EXISTS",
        });
      }
      throw error;
    }
  },

  async listByIds(companyId: string, workTeamIds: string[]): Promise<WorkTeam[]> {
    if (workTeamIds.length === 0) {
      return [];
    }

    const pool = getPool();
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
    const idParams = workTeamIds.map((id, index) => {
      const param = `id${index}`;
      request.input(param, sql.UniqueIdentifier, id);
      return `@${param}`;
    });

    const result = await request.query(`
      SELECT *
      FROM work_teams
      WHERE company_id = @companyId
        AND id IN (${idParams.join(", ")})
    `);

    return result.recordset.map((row) => mapWorkTeamRow(row as Record<string, unknown>));
  },

  async listMembers(companyId: string, workTeamId: string): Promise<WorkTeamMember[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("workTeamId", sql.UniqueIdentifier, workTeamId)
      .query(`
        SELECT
          wtm.work_team_id,
          wtm.employee_id,
          wtm.created_at,
          wtm.created_by,
          e.name AS employee_name,
          e.document_number AS employee_document_number,
          e.phone_number AS employee_phone_number,
          e.employee_type AS employee_type,
          e.active AS employee_active,
          e.created_at AS employee_created_at,
          e.updated_at AS employee_updated_at
        FROM work_team_members wtm
        INNER JOIN work_teams wt ON wt.id = wtm.work_team_id AND wt.company_id = @companyId
        INNER JOIN employees e ON e.id = wtm.employee_id AND e.company_id = @companyId
        WHERE wtm.work_team_id = @workTeamId
        ORDER BY e.name ASC
      `);

    return result.recordset.map((row) => mapWorkTeamMemberRow(row as Record<string, unknown>));
  },

  async listMembersForTeams(companyId: string, workTeamIds: string[]): Promise<WorkTeamMember[]> {
    if (workTeamIds.length === 0) {
      return [];
    }

    const pool = getPool();
    const request = pool.request().input("companyId", sql.UniqueIdentifier, companyId);
    const idParams = workTeamIds.map((id, index) => {
      const param = `teamId${index}`;
      request.input(param, sql.UniqueIdentifier, id);
      return `@${param}`;
    });

    const result = await request.query(`
      SELECT
        wtm.work_team_id,
        wtm.employee_id,
        wtm.created_at,
        wtm.created_by,
        e.name AS employee_name,
        e.document_number AS employee_document_number,
        e.phone_number AS employee_phone_number,
        e.employee_type AS employee_type,
        e.active AS employee_active,
        e.created_at AS employee_created_at,
        e.updated_at AS employee_updated_at
      FROM work_team_members wtm
      INNER JOIN work_teams wt ON wt.id = wtm.work_team_id AND wt.company_id = @companyId
      INNER JOIN employees e ON e.id = wtm.employee_id AND e.company_id = @companyId
      WHERE wtm.work_team_id IN (${idParams.join(", ")})
      ORDER BY wt.name ASC, e.name ASC
    `);

    return result.recordset.map((row) => mapWorkTeamMemberRow(row as Record<string, unknown>));
  },

  async listByIdsInTransaction(
    companyId: string,
    workTeamIds: string[],
    transaction: sql.Transaction,
  ): Promise<WorkTeam[]> {
    if (workTeamIds.length === 0) {
      return [];
    }

    const request = new sql.Request(transaction).input("companyId", sql.UniqueIdentifier, companyId);
    const idParams = workTeamIds.map((id, index) => {
      const param = `id${index}`;
      request.input(param, sql.UniqueIdentifier, id);
      return `@${param}`;
    });

    const result = await request.query(`
      SELECT *
      FROM work_teams WITH (UPDLOCK, HOLDLOCK)
      WHERE company_id = @companyId
        AND id IN (${idParams.join(", ")})
    `);

    return result.recordset.map((row) => mapWorkTeamRow(row as Record<string, unknown>));
  },

  async listMembersForTeamsInTransaction(
    companyId: string,
    workTeamIds: string[],
    transaction: sql.Transaction,
  ): Promise<WorkTeamMember[]> {
    if (workTeamIds.length === 0) {
      return [];
    }

    const request = new sql.Request(transaction).input("companyId", sql.UniqueIdentifier, companyId);
    const idParams = workTeamIds.map((id, index) => {
      const param = `teamId${index}`;
      request.input(param, sql.UniqueIdentifier, id);
      return `@${param}`;
    });

    const result = await request.query(`
      SELECT
        wtm.work_team_id,
        wtm.employee_id,
        wtm.created_at,
        wtm.created_by,
        e.name AS employee_name,
        e.document_number AS employee_document_number,
        e.phone_number AS employee_phone_number,
        e.employee_type AS employee_type,
        e.active AS employee_active,
        e.created_at AS employee_created_at,
        e.updated_at AS employee_updated_at
      FROM work_team_members wtm
      INNER JOIN work_teams wt ON wt.id = wtm.work_team_id AND wt.company_id = @companyId
      INNER JOIN employees e ON e.id = wtm.employee_id AND e.company_id = @companyId
      WHERE wtm.work_team_id IN (${idParams.join(", ")})
      ORDER BY wt.name ASC, e.name ASC
    `);

    return result.recordset.map((row) => mapWorkTeamMemberRow(row as Record<string, unknown>));
  },

  async bumpAssignmentVersionInTransaction(
    transaction: sql.Transaction,
    workTeamId: string,
  ): Promise<void> {
    await new sql.Request(transaction)
      .input("workTeamId", sql.UniqueIdentifier, workTeamId)
      .query(`
        UPDATE work_teams
        SET assignment_version = assignment_version + 1,
            updated_at = SYSUTCDATETIME()
        WHERE id = @workTeamId
      `);
  },
};

export const workTeamMemberRepository = {
  async addMemberInTransaction(
    transaction: sql.Transaction,
    input: {
      workTeamId: string;
      employeeId: string;
      createdBy: string | null;
    },
  ): Promise<void> {
    await new sql.Request(transaction)
      .input("workTeamId", sql.UniqueIdentifier, input.workTeamId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("createdBy", sql.UniqueIdentifier, input.createdBy)
      .query(`
        INSERT INTO work_team_members (work_team_id, employee_id, created_by)
        VALUES (@workTeamId, @employeeId, @createdBy)
      `);
  },

  async removeMemberInTransaction(
    transaction: sql.Transaction,
    workTeamId: string,
    employeeId: string,
  ): Promise<boolean> {
    const result = await new sql.Request(transaction)
      .input("workTeamId", sql.UniqueIdentifier, workTeamId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        DELETE FROM work_team_members
        WHERE work_team_id = @workTeamId AND employee_id = @employeeId
      `);

    return (result.rowsAffected[0] ?? 0) > 0;
  },

  async replaceMembersInTransaction(
    transaction: sql.Transaction,
    workTeamId: string,
    employeeIds: string[],
    createdBy: string | null,
  ): Promise<void> {
    await new sql.Request(transaction)
      .input("workTeamId", sql.UniqueIdentifier, workTeamId)
      .query(`DELETE FROM work_team_members WHERE work_team_id = @workTeamId`);

    for (const employeeId of employeeIds) {
      await workTeamMemberRepository.addMemberInTransaction(transaction, {
        workTeamId,
        employeeId,
        createdBy,
      });
    }
  },

  async memberExists(workTeamId: string, employeeId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("workTeamId", sql.UniqueIdentifier, workTeamId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT TOP 1 1 AS found
        FROM work_team_members
        WHERE work_team_id = @workTeamId AND employee_id = @employeeId
      `);

    return Boolean(result.recordset[0]);
  },
};
