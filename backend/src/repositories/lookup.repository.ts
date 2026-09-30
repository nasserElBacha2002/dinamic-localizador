import sql from "mssql";
import { getPool } from "../database/connection";
import type {
  EmployeeLookup,
  OperationLookup,
  ServiceLookup,
} from "../types/lookup";
import type {
  EmployeeLookupQuery,
  OperationLookupQuery,
  ServiceLookupQuery,
} from "../schemas/lookup.schema";
import {
  buildGroupAndLikeClause,
  mergeEmployeeLookupGroups,
  parseLookupSearchGroups,
  type MultiTermLikeClause,
} from "../utils/multi-term-like-search";

const toIsoString = (value: Date | string | null): string | null => {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
};

const mapEmployeeLookupRows = (recordset: Array<Record<string, unknown>>): EmployeeLookup[] =>
  recordset.map((row) => ({
    id: String(row.id),
    fullName: String(row.full_name),
  }));

/**
 * One TOP(@limit) page for a fixed name predicate (or none).
 * Shared by single-term search and each independent comma-group.
 */
const listEmployeesPage = async (
  companyId: string,
  query: EmployeeLookupQuery,
  nameSearch: MultiTermLikeClause | null,
): Promise<EmployeeLookup[]> => {
  const pool = getPool();
  const request = pool
    .request()
    .input("companyId", sql.UniqueIdentifier, companyId)
    .input("limit", sql.Int, query.limit ?? 20);

  const filters = ["e.company_id = @companyId"];
  const ids = query.ids ?? [];

  if (ids.length === 1) {
    request.input("id", sql.UniqueIdentifier, ids[0]);
    filters.push("e.id = @id");
  } else if (ids.length > 1) {
    const placeholders = ids.map((id, index) => {
      const param = `id${index}`;
      request.input(param, sql.UniqueIdentifier, id);
      return `@${param}`;
    });
    filters.push(`e.id IN (${placeholders.join(", ")})`);
  }

  if (nameSearch?.clause) {
    for (const param of nameSearch.params) {
      request.input(param.name, sql.NVarChar(150), param.value);
    }
    filters.push(nameSearch.clause);
  }

  if (query.active === true) {
    filters.push("e.active = 1");
  }

  const result = await request.query(`
    SELECT TOP (@limit)
      e.id,
      e.name AS full_name
    FROM employees e
    WHERE ${filters.join(" AND ")}
    ORDER BY e.name ASC
  `);

  return mapEmployeeLookupRows(result.recordset as Array<Record<string, unknown>>);
};

export const lookupRepository = {
  async listEmployees(
    companyId: string,
    query: EmployeeLookupQuery,
  ): Promise<EmployeeLookup[]> {
    const searchGroups = query.search ? parseLookupSearchGroups(query.search) : [];

    // No search text (or only empty commas/spaces): preserve historical single TOP.
    if (searchGroups.length === 0) {
      return listEmployeesPage(companyId, query, null);
    }

    // One independent search: single TOP page (spaces still AND within the person).
    if (searchGroups.length === 1) {
      const rows = await listEmployeesPage(
        companyId,
        query,
        buildGroupAndLikeClause("e.name", searchGroups[0]!, "search"),
      );
      return rows.map((row) => ({ ...row, matchedGroupIndex: 0 }));
    }

    // Multiple comma-separated searches: apply TOP per group so a populous
    // first group cannot monopolize the global result page, then dedupe.
    const perGroupPages: EmployeeLookup[][] = [];
    for (let groupIndex = 0; groupIndex < searchGroups.length; groupIndex += 1) {
      const groupTerms = searchGroups[groupIndex]!;
      perGroupPages.push(
        await listEmployeesPage(
          companyId,
          query,
          buildGroupAndLikeClause("e.name", groupTerms, `search${groupIndex}`),
        ),
      );
    }

    return mergeEmployeeLookupGroups(perGroupPages);
  },

  async listServices(companyId: string, query: ServiceLookupQuery): Promise<ServiceLookup[]> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("limit", sql.Int, query.limit ?? 20);

    const filters = ["s.company_id = @companyId"];
    const ids = query.ids ?? [];

    if (ids.length === 1) {
      request.input("id", sql.UniqueIdentifier, ids[0]);
      filters.push("s.id = @id");
    } else if (ids.length > 1) {
      const placeholders = ids.map((id, index) => {
        const param = `id${index}`;
        request.input(param, sql.UniqueIdentifier, id);
        return `@${param}`;
      });
      filters.push(`s.id IN (${placeholders.join(", ")})`);
    }

    if (query.search) {
      request.input("search", sql.NVarChar(150), `%${query.search}%`);
      filters.push("(s.name LIKE @search OR s.address LIKE @search)");
    }

    if (query.active === true) {
      filters.push("s.active = 1");
    }

    const result = await request.query(`
      SELECT TOP (@limit)
        s.id,
        s.name,
        s.address
      FROM operational_locations s
      WHERE ${filters.join(" AND ")}
      ORDER BY s.name ASC
    `);

    return result.recordset.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      address: row.address ? String(row.address) : null,
    }));
  },

  async listOperations(
    companyId: string,
    query: OperationLookupQuery,
  ): Promise<OperationLookup[]> {
    const pool = getPool();
    const request = pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("limit", sql.Int, query.limit ?? 20);

    const filters = ["i.company_id = @companyId"];
    const ids = query.ids ?? [];

    if (ids.length === 1) {
      request.input("id", sql.UniqueIdentifier, ids[0]);
      filters.push("i.id = @id");
    } else if (ids.length > 1) {
      const placeholders = ids.map((id, index) => {
        const param = `id${index}`;
        request.input(param, sql.UniqueIdentifier, id);
        return `@${param}`;
      });
      filters.push(`i.id IN (${placeholders.join(", ")})`);
    }

    if (query.search) {
      request.input("search", sql.NVarChar(150), `%${query.search}%`);
      filters.push("(s.name LIKE @search OR s.address LIKE @search)");
    }

    const result = await request.query(`
      SELECT TOP (@limit)
        i.id,
        i.scheduled_start,
        i.scheduled_end,
        i.schedule_mode,
        s.name AS service_name
      FROM scheduled_operations i
      INNER JOIN operational_locations s ON s.id = i.service_id AND s.company_id = i.company_id
      WHERE ${filters.join(" AND ")}
      ORDER BY i.scheduled_start DESC
    `);

    return result.recordset.map((row) => {
      const serviceName = String(row.service_name);
      const startDate = toIsoString(row.scheduled_start as Date | string) ?? "";
      const endDate = toIsoString(row.scheduled_end as Date | string | null);
      const scheduleMode =
        String(row.schedule_mode ?? "SINGLE") === "MULTI_SHIFT" ? "MULTI_SHIFT" : "SINGLE";

      return {
        id: String(row.id),
        name: serviceName,
        startDate,
        endDate,
        serviceName,
        scheduleMode,
      };
    });
  },
};
