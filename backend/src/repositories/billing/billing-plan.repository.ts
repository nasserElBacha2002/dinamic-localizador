import sql from "mssql";
import { randomUUID } from "node:crypto";
import {
  BILLING_PLAN_KINDS,
  type BillingPlanKind,
} from "../../constants/billing-catalog";
import { getPool } from "../../database/connection";
import type { BillingPlan } from "../../types/billing-catalog";
import { isDuplicateKeyError } from "../../utils/sql-server-errors";

const toIso = (value: Date | string): string =>
  value instanceof Date ? value.toISOString() : new Date(value).toISOString();

const mapRow = (row: Record<string, unknown>): BillingPlan => ({
  id: String(row.id),
  planCode: String(row.plan_code),
  displayName: String(row.display_name),
  description: row.description ? String(row.description) : null,
  planKind: String(row.plan_kind) as BillingPlanKind,
  sortOrder: Number(row.sort_order),
  isActive: Boolean(row.is_active),
  isPublicForNewSubscription: Boolean(
    row.is_public_for_new_subscription ?? row.isPublicForNewSubscription ?? false,
  ),
  createdAt: toIso(row.created_at as Date | string),
  updatedAt: toIso(row.updated_at as Date | string),
});

const normalizePlanCode = (planCode: string): string => planCode.trim().toUpperCase();

const assertPlanKind = (planKind: string): BillingPlanKind => {
  if (!BILLING_PLAN_KINDS.includes(planKind as BillingPlanKind)) {
    throw new Error(`Invalid billing plan kind: ${planKind}`);
  }
  return planKind as BillingPlanKind;
};

export const billingPlanRepository = {
  async list(input?: { activeOnly?: boolean }): Promise<BillingPlan[]> {
    const pool = getPool();
    const activeOnly = input?.activeOnly === true;
    const result = await pool.request().query(`
      SELECT *
      FROM dbo.billing_plans
      ${activeOnly ? "WHERE is_active = 1" : ""}
      ORDER BY sort_order ASC, display_name ASC
    `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async listPublicForNewSubscription(_at?: Date): Promise<BillingPlan[]> {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT *
      FROM dbo.billing_plans
      WHERE is_active = 1
        AND is_public_for_new_subscription = 1
      ORDER BY sort_order ASC, display_name ASC
    `);
    return result.recordset.map((row) => mapRow(row as Record<string, unknown>));
  },

  async findById(planId: string): Promise<BillingPlan | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("planId", sql.UniqueIdentifier, planId)
      .query(`
        SELECT TOP 1 *
        FROM dbo.billing_plans
        WHERE id = @planId
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findByCode(planCode: string): Promise<BillingPlan | null> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("planCode", sql.NVarChar(40), normalizePlanCode(planCode))
      .query(`
        SELECT TOP 1 *
        FROM dbo.billing_plans
        WHERE plan_code = @planCode
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async findByCodeInTransaction(
    transaction: sql.Transaction,
    planCode: string,
  ): Promise<BillingPlan | null> {
    const result = await new sql.Request(transaction)
      .input("planCode", sql.NVarChar(40), normalizePlanCode(planCode))
      .query(`
        SELECT TOP 1 *
        FROM dbo.billing_plans WITH (UPDLOCK, HOLDLOCK)
        WHERE plan_code = @planCode
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    return row ? mapRow(row) : null;
  },

  async insert(input: {
    planCode: string;
    displayName: string;
    description?: string | null;
    planKind?: BillingPlanKind;
    sortOrder?: number;
    isActive?: boolean;
    isPublicForNewSubscription?: boolean;
  }): Promise<BillingPlan> {
    const pool = getPool();
    const planId = randomUUID();
    const planKind = assertPlanKind(input.planKind ?? "STANDARD");

    try {
      const result = await pool
        .request()
        .input("planId", sql.UniqueIdentifier, planId)
        .input("planCode", sql.NVarChar(40), normalizePlanCode(input.planCode))
        .input("displayName", sql.NVarChar(120), input.displayName.trim())
        .input("description", sql.NVarChar(500), input.description?.trim() || null)
        .input("planKind", sql.NVarChar(20), planKind)
        .input("sortOrder", sql.Int, input.sortOrder ?? 0)
        .input("isActive", sql.Bit, input.isActive === false ? 0 : 1)
        .input(
          "isPublicForNewSubscription",
          sql.Bit,
          input.isPublicForNewSubscription === true ? 1 : 0,
        )
        .query(`
          INSERT INTO dbo.billing_plans (
            id,
            plan_code,
            display_name,
            description,
            plan_kind,
            sort_order,
            is_active,
            is_public_for_new_subscription
          )
          OUTPUT INSERTED.*
          VALUES (
            @planId,
            @planCode,
            @displayName,
            @description,
            @planKind,
            @sortOrder,
            @isActive,
            @isPublicForNewSubscription
          )
        `);
      return mapRow(result.recordset[0] as Record<string, unknown>);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw error;
      }
      throw error;
    }
  },

  async insertInTransaction(
    transaction: sql.Transaction,
    input: {
      planCode: string;
      displayName: string;
      description?: string | null;
      planKind?: BillingPlanKind;
      sortOrder?: number;
      isActive?: boolean;
      isPublicForNewSubscription?: boolean;
    },
  ): Promise<BillingPlan> {
    const planId = randomUUID();
    const planKind = assertPlanKind(input.planKind ?? "STANDARD");

    const result = await new sql.Request(transaction)
      .input("planId", sql.UniqueIdentifier, planId)
      .input("planCode", sql.NVarChar(40), normalizePlanCode(input.planCode))
      .input("displayName", sql.NVarChar(120), input.displayName.trim())
      .input("description", sql.NVarChar(500), input.description?.trim() || null)
      .input("planKind", sql.NVarChar(20), planKind)
      .input("sortOrder", sql.Int, input.sortOrder ?? 0)
      .input("isActive", sql.Bit, input.isActive === false ? 0 : 1)
      .input(
        "isPublicForNewSubscription",
        sql.Bit,
        input.isPublicForNewSubscription === true ? 1 : 0,
      )
      .query(`
        INSERT INTO dbo.billing_plans (
          id,
          plan_code,
          display_name,
          description,
          plan_kind,
          sort_order,
          is_active,
          is_public_for_new_subscription
        )
        OUTPUT INSERTED.*
        VALUES (
          @planId,
          @planCode,
          @displayName,
          @description,
          @planKind,
          @sortOrder,
          @isActive,
          @isPublicForNewSubscription
        )
      `);

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },

  async setPublicForNewSubscriptionInTransaction(
    transaction: sql.Transaction,
    planId: string,
    isPublicForNewSubscription: boolean,
  ): Promise<void> {
    await new sql.Request(transaction)
      .input("planId", sql.UniqueIdentifier, planId)
      .input("isPublicForNewSubscription", sql.Bit, isPublicForNewSubscription ? 1 : 0)
      .query(`
        UPDATE dbo.billing_plans
        SET
          is_public_for_new_subscription = @isPublicForNewSubscription,
          updated_at = SYSUTCDATETIME()
        WHERE id = @planId
      `);
  },

  async updateMetadata(
    planId: string,
    input: {
      displayName?: string;
      description?: string | null;
      planKind?: BillingPlanKind;
      sortOrder?: number;
      isActive?: boolean;
      isPublicForNewSubscription?: boolean;
    },
  ): Promise<BillingPlan> {
    const pool = getPool();
    const existing = await this.findById(planId);
    if (!existing) {
      throw new Error("Billing plan not found");
    }

    const planKind = input.planKind ? assertPlanKind(input.planKind) : existing.planKind;

    const result = await pool
      .request()
      .input("planId", sql.UniqueIdentifier, planId)
      .input("displayName", sql.NVarChar(120), input.displayName?.trim() ?? existing.displayName)
      .input(
        "description",
        sql.NVarChar(500),
        input.description === undefined
          ? existing.description
          : input.description?.trim() || null,
      )
      .input("planKind", sql.NVarChar(20), planKind)
      .input("sortOrder", sql.Int, input.sortOrder ?? existing.sortOrder)
      .input(
        "isActive",
        sql.Bit,
        input.isActive === undefined ? (existing.isActive ? 1 : 0) : input.isActive ? 1 : 0,
      )
      .input(
        "isPublicForNewSubscription",
        sql.Bit,
        input.isPublicForNewSubscription === undefined
          ? existing.isPublicForNewSubscription
            ? 1
            : 0
          : input.isPublicForNewSubscription
            ? 1
            : 0,
      )
      .query(`
        UPDATE dbo.billing_plans
        SET
          display_name = @displayName,
          description = @description,
          plan_kind = @planKind,
          sort_order = @sortOrder,
          is_active = @isActive,
          is_public_for_new_subscription = @isPublicForNewSubscription,
          updated_at = SYSUTCDATETIME()
        OUTPUT INSERTED.*
        WHERE id = @planId
      `);

    return mapRow(result.recordset[0] as Record<string, unknown>);
  },
};