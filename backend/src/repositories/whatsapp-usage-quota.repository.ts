import sql from "mssql";
import { getPool } from "../database/connection";
import type { WhatsAppQuotaMode } from "../constants/whatsapp-usage-quota";
import type { QuotaPeriodWindow } from "../utils/whatsapp-quota-periods";
import { isDuplicateKeyError } from "../utils/sql-server-errors";

export type EnsureEmployeePeriodInput = {
  companyId: string;
  employeeId: string;
  window: QuotaPeriodWindow;
  turnLimit: number;
  outboundLimit: number;
};

const ensureEmployeePeriodSql = `
  MERGE dbo.whatsapp_quota_employee_periods WITH (HOLDLOCK) AS target
  USING (SELECT @companyId AS company_id, @employeeId AS employee_id,
                @periodKind AS period_kind, @periodKey AS period_key) AS src
    ON target.company_id = src.company_id
   AND target.employee_id = src.employee_id
   AND target.period_kind = src.period_kind
   AND target.period_key = src.period_key
  WHEN NOT MATCHED THEN
    INSERT (company_id, employee_id, period_kind, period_key,
            period_start_utc, period_end_utc, timezone_id,
            turn_limit, outbound_limit)
    VALUES (@companyId, @employeeId, @periodKind, @periodKey,
            @periodStartUtc, @periodEndUtc, @timezoneId,
            @turnLimit, @outboundLimit)
  WHEN MATCHED THEN
    UPDATE SET updated_at = SYSUTCDATETIME()
  OUTPUT INSERTED.id AS id, INSERTED.turn_limit AS turn_limit,
         INSERTED.outbound_limit AS outbound_limit,
         INSERTED.turns_consumed AS turns_consumed,
         INSERTED.turns_reserved AS turns_reserved,
         INSERTED.outbounds_consumed AS outbounds_consumed,
         INSERTED.outbounds_reserved AS outbounds_reserved,
         INSERTED.period_end_utc AS period_end_utc;
`;

const ensureCompanyPeriodSql = `
  MERGE dbo.whatsapp_quota_company_periods WITH (HOLDLOCK) AS target
  USING (SELECT @companyId AS company_id, @periodKind AS period_kind, @periodKey AS period_key) AS src
    ON target.company_id = src.company_id
   AND target.period_kind = src.period_kind
   AND target.period_key = src.period_key
  WHEN NOT MATCHED THEN
    INSERT (company_id, period_kind, period_key,
            period_start_utc, period_end_utc, timezone_id, outbound_limit)
    VALUES (@companyId, @periodKind, @periodKey,
            @periodStartUtc, @periodEndUtc, @timezoneId, @outboundLimit)
  WHEN MATCHED THEN
    UPDATE SET updated_at = SYSUTCDATETIME()
  OUTPUT INSERTED.id AS id, INSERTED.outbound_limit AS outbound_limit,
         INSERTED.outbounds_consumed AS outbounds_consumed,
         INSERTED.outbounds_reserved AS outbounds_reserved,
         INSERTED.period_end_utc AS period_end_utc;
`;

export const whatsappUsageQuotaRepository = {
  async getEmployeePeriodUsage(input: {
    companyId: string;
    employeeId: string;
    periodKind: string;
    periodKey: string;
  }): Promise<{
    turnsUsed: number;
    turnLimit: number;
    outboundsUsed: number;
    outboundLimit: number;
    periodEndUtc: Date | null;
  } | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("periodKind", sql.NVarChar(10), input.periodKind)
      .input("periodKey", sql.NVarChar(32), input.periodKey)
      .query(`
        SELECT turns_consumed, turns_reserved, turn_limit,
               outbounds_consumed, outbounds_reserved, outbound_limit, period_end_utc
        FROM dbo.whatsapp_quota_employee_periods
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND period_kind = @periodKind
          AND period_key = @periodKey;
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      turnsUsed: Number(row.turns_consumed) + Number(row.turns_reserved),
      turnLimit: Number(row.turn_limit),
      outboundsUsed: Number(row.outbounds_consumed) + Number(row.outbounds_reserved),
      outboundLimit: Number(row.outbound_limit),
      periodEndUtc:
        row.period_end_utc instanceof Date
          ? row.period_end_utc
          : new Date(String(row.period_end_utc)),
    };
  },

  async countRecentAdmissions(input: {
    companyId: string;
    employeeId: string;
    since: Date;
    /** Enforcement burst counts only real ENFORCE admissions. */
    enforceOnly?: boolean;
  }): Promise<number> {
    const enforceOnly = input.enforceOnly !== false;
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("since", sql.DateTime2, input.since)
      .query(`
        SELECT COUNT(*) AS cnt
        FROM dbo.whatsapp_quota_turn_admissions
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND admitted_at IS NOT NULL
          AND admitted_at > @since
          AND decision = N'ADMITTED'
          ${enforceOnly ? "AND mode = N'ENFORCE'" : ""};
      `);
    return Number(result.recordset[0]?.cnt ?? 0);
  },

  async findOpenEmployeePeriodContaining(input: {
    companyId: string;
    employeeId: string;
    periodKind: string;
    now: Date;
  }): Promise<{
    periodKey: string;
    periodStartUtc: Date;
    periodEndUtc: Date;
    timezoneId: string;
    turnsUsed: number;
    turnLimit: number;
    outboundsUsed: number;
    outboundLimit: number;
  } | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("periodKind", sql.NVarChar(10), input.periodKind)
      .input("now", sql.DateTime2, input.now)
      .query(`
        SELECT TOP 1
          period_key, period_start_utc, period_end_utc, timezone_id,
          turns_consumed, turns_reserved, turn_limit,
          outbounds_consumed, outbounds_reserved, outbound_limit
        FROM dbo.whatsapp_quota_employee_periods
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND period_kind = @periodKind
          AND period_start_utc <= @now
          AND period_end_utc > @now
        ORDER BY created_at DESC;
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      periodKey: String(row.period_key),
      periodStartUtc:
        row.period_start_utc instanceof Date
          ? row.period_start_utc
          : new Date(String(row.period_start_utc)),
      periodEndUtc:
        row.period_end_utc instanceof Date
          ? row.period_end_utc
          : new Date(String(row.period_end_utc)),
      timezoneId: String(row.timezone_id),
      turnsUsed: Number(row.turns_consumed) + Number(row.turns_reserved),
      turnLimit: Number(row.turn_limit),
      outboundsUsed: Number(row.outbounds_consumed) + Number(row.outbounds_reserved),
      outboundLimit: Number(row.outbound_limit),
    };
  },

  async findOpenCompanyPeriodContaining(input: {
    companyId: string;
    periodKind: string;
    now: Date;
  }): Promise<{
    periodKey: string;
    periodStartUtc: Date;
    periodEndUtc: Date;
    timezoneId: string;
    outboundsUsed: number;
    outboundLimit: number;
  } | null> {
    const result = await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("periodKind", sql.NVarChar(10), input.periodKind)
      .input("now", sql.DateTime2, input.now)
      .query(`
        SELECT TOP 1
          period_key, period_start_utc, period_end_utc, timezone_id,
          outbounds_consumed, outbounds_reserved, outbound_limit
        FROM dbo.whatsapp_quota_company_periods
        WHERE company_id = @companyId
          AND period_kind = @periodKind
          AND period_start_utc <= @now
          AND period_end_utc > @now
        ORDER BY created_at DESC;
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      periodKey: String(row.period_key),
      periodStartUtc:
        row.period_start_utc instanceof Date
          ? row.period_start_utc
          : new Date(String(row.period_start_utc)),
      periodEndUtc:
        row.period_end_utc instanceof Date
          ? row.period_end_utc
          : new Date(String(row.period_end_utc)),
      timezoneId: String(row.timezone_id),
      outboundsUsed: Number(row.outbounds_consumed) + Number(row.outbounds_reserved),
      outboundLimit: Number(row.outbound_limit),
    };
  },

  async findTurnAdmission(messageSid: string): Promise<{
    decision: string;
    reasonCode: string;
    mode: string;
  } | null> {
    const result = await getPool()
      .request()
      .input("messageSid", sql.NVarChar(64), messageSid)
      .query(`
        SELECT TOP 1 decision, reason_code, mode
        FROM dbo.whatsapp_quota_turn_admissions
        WHERE message_sid = @messageSid;
      `);
    const row = result.recordset[0] as Record<string, unknown> | undefined;
    if (!row) return null;
    return {
      decision: String(row.decision),
      reasonCode: String(row.reason_code),
      mode: String(row.mode),
    };
  },

  /**
   * Atomically admit one non-critical turn against day + week + burst.
   * Lock order: day period row → week period row (by id ascending via sequential updates).
   * No HTTP inside the transaction.
   */
  async admitTurnAtomic(input: {
    companyId: string;
    employeeId: string;
    messageSid: string;
    classification: string;
    mode: WhatsAppQuotaMode;
    day: EnsureEmployeePeriodInput;
    week: EnsureEmployeePeriodInput;
    burstTurns: number;
    burstWindowSeconds: number;
    now: Date;
  }): Promise<
    | { ok: true; decision: "ADMITTED"; reasonCode: string; dayPeriodId: string; weekPeriodId: string }
    | {
        ok: false;
        decision: "REJECTED";
        reasonCode: string;
        recoverAtUtc: Date | null;
      }
  > {
    const pool = getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const dayReq = new sql.Request(tx);
      dayReq.input("companyId", sql.UniqueIdentifier, input.day.companyId);
      dayReq.input("employeeId", sql.UniqueIdentifier, input.day.employeeId);
      dayReq.input("periodKind", sql.NVarChar(10), input.day.window.kind);
      dayReq.input("periodKey", sql.NVarChar(32), input.day.window.periodKey);
      dayReq.input("periodStartUtc", sql.DateTime2, input.day.window.periodStartUtc);
      dayReq.input("periodEndUtc", sql.DateTime2, input.day.window.periodEndUtc);
      dayReq.input("timezoneId", sql.NVarChar(80), input.day.window.timezoneId);
      dayReq.input("turnLimit", sql.Int, input.day.turnLimit);
      dayReq.input("outboundLimit", sql.Int, input.day.outboundLimit);
      const dayResult = await dayReq.query(ensureEmployeePeriodSql);
      const dayRow = dayResult.recordset[0] as Record<string, unknown>;
      const dayId = String(dayRow.id);

      const weekReq = new sql.Request(tx);
      weekReq.input("companyId", sql.UniqueIdentifier, input.week.companyId);
      weekReq.input("employeeId", sql.UniqueIdentifier, input.week.employeeId);
      weekReq.input("periodKind", sql.NVarChar(10), input.week.window.kind);
      weekReq.input("periodKey", sql.NVarChar(32), input.week.window.periodKey);
      weekReq.input("periodStartUtc", sql.DateTime2, input.week.window.periodStartUtc);
      weekReq.input("periodEndUtc", sql.DateTime2, input.week.window.periodEndUtc);
      weekReq.input("timezoneId", sql.NVarChar(80), input.week.window.timezoneId);
      weekReq.input("turnLimit", sql.Int, input.week.turnLimit);
      weekReq.input("outboundLimit", sql.Int, input.week.outboundLimit);
      const weekResult = await weekReq.query(ensureEmployeePeriodSql);
      const weekRow = weekResult.recordset[0] as Record<string, unknown>;
      const weekId = String(weekRow.id);

      // Stable lock order by GUID string compare
      const firstId = dayId < weekId ? dayId : weekId;
      const secondId = dayId < weekId ? weekId : dayId;
      await new sql.Request(tx)
        .input("id", sql.UniqueIdentifier, firstId)
        .query(`SELECT id FROM dbo.whatsapp_quota_employee_periods WITH (UPDLOCK, ROWLOCK) WHERE id = @id`);
      await new sql.Request(tx)
        .input("id", sql.UniqueIdentifier, secondId)
        .query(`SELECT id FROM dbo.whatsapp_quota_employee_periods WITH (UPDLOCK, ROWLOCK) WHERE id = @id`);

      const dayCap = await new sql.Request(tx)
        .input("id", sql.UniqueIdentifier, dayId)
        .query(`
          SELECT turns_consumed, turns_reserved, turn_limit, period_end_utc
          FROM dbo.whatsapp_quota_employee_periods WHERE id = @id;
        `);
      const weekCap = await new sql.Request(tx)
        .input("id", sql.UniqueIdentifier, weekId)
        .query(`
          SELECT turns_consumed, turns_reserved, turn_limit, period_end_utc
          FROM dbo.whatsapp_quota_employee_periods WHERE id = @id;
        `);
      const d = dayCap.recordset[0] as Record<string, unknown>;
      const w = weekCap.recordset[0] as Record<string, unknown>;
      const dayUsed = Number(d.turns_consumed) + Number(d.turns_reserved);
      const weekUsed = Number(w.turns_consumed) + Number(w.turns_reserved);

      if (dayUsed + 1 > Number(d.turn_limit)) {
        await tx.rollback();
        return {
          ok: false,
          decision: "REJECTED",
          reasonCode: "BLOCKED_DAILY_TURNS",
          recoverAtUtc: d.period_end_utc instanceof Date ? d.period_end_utc : new Date(String(d.period_end_utc)),
        };
      }
      if (weekUsed + 1 > Number(w.turn_limit)) {
        await tx.rollback();
        return {
          ok: false,
          decision: "REJECTED",
          reasonCode: "BLOCKED_WEEKLY_TURNS",
          recoverAtUtc: w.period_end_utc instanceof Date ? w.period_end_utc : new Date(String(w.period_end_utc)),
        };
      }

      const burstSince = new Date(input.now.getTime() - input.burstWindowSeconds * 1000);
      const burst = await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("since", sql.DateTime2, burstSince)
        .query(`
          SELECT COUNT(*) AS cnt
          FROM dbo.whatsapp_quota_turn_admissions WITH (UPDLOCK, HOLDLOCK)
          WHERE company_id = @companyId
            AND employee_id = @employeeId
            AND admitted_at IS NOT NULL
            AND admitted_at > @since
            AND decision = N'ADMITTED'
            AND mode = N'ENFORCE';
        `);
      if (Number(burst.recordset[0].cnt) + 1 > input.burstTurns) {
        await tx.rollback();
        return {
          ok: false,
          decision: "REJECTED",
          reasonCode: "BLOCKED_BURST",
          recoverAtUtc: new Date(input.now.getTime() + 1000),
        };
      }

      await new sql.Request(tx)
        .input("dayId", sql.UniqueIdentifier, dayId)
        .input("weekId", sql.UniqueIdentifier, weekId)
        .query(`
          UPDATE dbo.whatsapp_quota_employee_periods
          SET turns_reserved = turns_reserved + 1, updated_at = SYSUTCDATETIME()
          WHERE id IN (@dayId, @weekId);
        `);

      try {
        await new sql.Request(tx)
          .input("companyId", sql.UniqueIdentifier, input.companyId)
          .input("employeeId", sql.UniqueIdentifier, input.employeeId)
          .input("messageSid", sql.NVarChar(64), input.messageSid)
          .input("decision", sql.NVarChar(40), "ADMITTED")
          .input("reasonCode", sql.NVarChar(80), "ADMITTED")
          .input("classification", sql.NVarChar(40), input.classification)
          .input("dayPeriodId", sql.UniqueIdentifier, dayId)
          .input("weekPeriodId", sql.UniqueIdentifier, weekId)
          .input("mode", sql.NVarChar(20), input.mode)
          .input("admittedAt", sql.DateTime2, input.now)
          .query(`
            INSERT INTO dbo.whatsapp_quota_turn_admissions (
              company_id, employee_id, message_sid, decision, reason_code,
              classification, day_period_id, week_period_id, mode, admitted_at
            ) VALUES (
              @companyId, @employeeId, @messageSid, @decision, @reasonCode,
              @classification, @dayPeriodId, @weekPeriodId, @mode, @admittedAt
            );
          `);
      } catch (error) {
        if (isDuplicateKeyError(error)) {
          await tx.rollback();
          return {
            ok: false,
            decision: "REJECTED",
            reasonCode: "DUPLICATE",
            recoverAtUtc: null,
          };
        }
        throw error;
      }

      // Convert reservation to consumed immediately for turn admission
      // (turn is admitted for processing; outbound units reserved separately).
      await new sql.Request(tx)
        .input("dayId", sql.UniqueIdentifier, dayId)
        .input("weekId", sql.UniqueIdentifier, weekId)
        .query(`
          UPDATE dbo.whatsapp_quota_employee_periods
          SET turns_reserved = turns_reserved - 1,
              turns_consumed = turns_consumed + 1,
              updated_at = SYSUTCDATETIME()
          WHERE id IN (@dayId, @weekId);
        `);

      await tx.commit();
      return {
        ok: true,
        decision: "ADMITTED",
        reasonCode: "ADMITTED",
        dayPeriodId: dayId,
        weekPeriodId: weekId,
      };
    } catch (error) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw error;
    }
  },

  async insertTurnDecision(input: {
    companyId: string;
    employeeId: string;
    messageSid: string;
    decision: string;
    reasonCode: string;
    classification: string;
    mode: WhatsAppQuotaMode;
    admittedAt?: Date | null;
    dayPeriodId?: string | null;
    weekPeriodId?: string | null;
  }): Promise<"inserted" | "duplicate"> {
    try {
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("messageSid", sql.NVarChar(64), input.messageSid)
        .input("decision", sql.NVarChar(40), input.decision)
        .input("reasonCode", sql.NVarChar(80), input.reasonCode)
        .input("classification", sql.NVarChar(40), input.classification)
        .input("dayPeriodId", sql.UniqueIdentifier, input.dayPeriodId ?? null)
        .input("weekPeriodId", sql.UniqueIdentifier, input.weekPeriodId ?? null)
        .input("mode", sql.NVarChar(20), input.mode)
        .input("admittedAt", sql.DateTime2, input.admittedAt ?? null)
        .query(`
          INSERT INTO dbo.whatsapp_quota_turn_admissions (
            company_id, employee_id, message_sid, decision, reason_code,
            classification, day_period_id, week_period_id, mode, admitted_at
          ) VALUES (
            @companyId, @employeeId, @messageSid, @decision, @reasonCode,
            @classification, @dayPeriodId, @weekPeriodId, @mode, @admittedAt
          );
        `);
      return "inserted";
    } catch (error) {
      if (isDuplicateKeyError(error)) return "duplicate";
      throw error;
    }
  },

  async reserveOutboundAtomic(input: {
    companyId: string;
    employeeId: string;
    turnMessageSid: string;
    logicalOutboundKey: string;
    mode: WhatsAppQuotaMode;
    day: EnsureEmployeePeriodInput;
    week: EnsureEmployeePeriodInput;
    companyDay: {
      companyId: string;
      window: QuotaPeriodWindow;
      outboundLimit: number;
    };
  }): Promise<
    | { ok: true; reservationId: string; reused: boolean }
    | { ok: false; reasonCode: string; recoverAtUtc: Date | null }
  > {
    const existing = await getPool()
      .request()
      .input("key", sql.NVarChar(160), input.logicalOutboundKey)
      .query(`
        SELECT TOP 1 id, status
        FROM dbo.whatsapp_quota_outbound_reservations
        WHERE logical_outbound_key = @key;
      `);
    const existingRow = existing.recordset[0] as Record<string, unknown> | undefined;
    if (existingRow) {
      const status = String(existingRow.status);
      if (status === "RELEASED") {
        // fall through to re-reserve only if released before effect
      } else {
        return { ok: true, reservationId: String(existingRow.id), reused: true };
      }
    }

    const pool = getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const ensureEmp = async (period: EnsureEmployeePeriodInput) => {
        const req = new sql.Request(tx);
        req.input("companyId", sql.UniqueIdentifier, period.companyId);
        req.input("employeeId", sql.UniqueIdentifier, period.employeeId);
        req.input("periodKind", sql.NVarChar(10), period.window.kind);
        req.input("periodKey", sql.NVarChar(32), period.window.periodKey);
        req.input("periodStartUtc", sql.DateTime2, period.window.periodStartUtc);
        req.input("periodEndUtc", sql.DateTime2, period.window.periodEndUtc);
        req.input("timezoneId", sql.NVarChar(80), period.window.timezoneId);
        req.input("turnLimit", sql.Int, period.turnLimit);
        req.input("outboundLimit", sql.Int, period.outboundLimit);
        const result = await req.query(ensureEmployeePeriodSql);
        return result.recordset[0] as Record<string, unknown>;
      };

      const dayRow = await ensureEmp(input.day);
      const weekRow = await ensureEmp(input.week);

      const companyReq = new sql.Request(tx);
      companyReq.input("companyId", sql.UniqueIdentifier, input.companyDay.companyId);
      companyReq.input("periodKind", sql.NVarChar(10), input.companyDay.window.kind);
      companyReq.input("periodKey", sql.NVarChar(32), input.companyDay.window.periodKey);
      companyReq.input("periodStartUtc", sql.DateTime2, input.companyDay.window.periodStartUtc);
      companyReq.input("periodEndUtc", sql.DateTime2, input.companyDay.window.periodEndUtc);
      companyReq.input("timezoneId", sql.NVarChar(80), input.companyDay.window.timezoneId);
      companyReq.input("outboundLimit", sql.Int, input.companyDay.outboundLimit);
      const companyResult = await companyReq.query(ensureCompanyPeriodSql);
      const companyRow = companyResult.recordset[0] as Record<string, unknown>;

      const dayId = String(dayRow.id);
      const weekId = String(weekRow.id);
      const companyId = String(companyRow.id);

      const ids = [dayId, weekId].sort();
      for (const id of ids) {
        await new sql.Request(tx)
          .input("id", sql.UniqueIdentifier, id)
          .query(
            `SELECT id FROM dbo.whatsapp_quota_employee_periods WITH (UPDLOCK, ROWLOCK) WHERE id = @id`,
          );
      }
      await new sql.Request(tx)
        .input("id", sql.UniqueIdentifier, companyId)
        .query(
          `SELECT id FROM dbo.whatsapp_quota_company_periods WITH (UPDLOCK, ROWLOCK) WHERE id = @id`,
        );

      const dayCap = await new sql.Request(tx)
        .input("id", sql.UniqueIdentifier, dayId)
        .query(
          `SELECT outbounds_consumed, outbounds_reserved, outbound_limit, period_end_utc FROM dbo.whatsapp_quota_employee_periods WHERE id = @id`,
        );
      const weekCap = await new sql.Request(tx)
        .input("id", sql.UniqueIdentifier, weekId)
        .query(
          `SELECT outbounds_consumed, outbounds_reserved, outbound_limit, period_end_utc FROM dbo.whatsapp_quota_employee_periods WHERE id = @id`,
        );
      const companyCap = await new sql.Request(tx)
        .input("id", sql.UniqueIdentifier, companyId)
        .query(
          `SELECT outbounds_consumed, outbounds_reserved, outbound_limit, period_end_utc FROM dbo.whatsapp_quota_company_periods WHERE id = @id`,
        );

      const d = dayCap.recordset[0] as Record<string, unknown>;
      const w = weekCap.recordset[0] as Record<string, unknown>;
      const c = companyCap.recordset[0] as Record<string, unknown>;

      if (Number(d.outbounds_consumed) + Number(d.outbounds_reserved) + 1 > Number(d.outbound_limit)) {
        await tx.rollback();
        return {
          ok: false,
          reasonCode: "BLOCKED_DAILY_OUTBOUNDS",
          recoverAtUtc: new Date(String(d.period_end_utc)),
        };
      }
      if (Number(w.outbounds_consumed) + Number(w.outbounds_reserved) + 1 > Number(w.outbound_limit)) {
        await tx.rollback();
        return {
          ok: false,
          reasonCode: "BLOCKED_WEEKLY_OUTBOUNDS",
          recoverAtUtc: new Date(String(w.period_end_utc)),
        };
      }
      if (Number(c.outbounds_consumed) + Number(c.outbounds_reserved) + 1 > Number(c.outbound_limit)) {
        await tx.rollback();
        return {
          ok: false,
          reasonCode: "BLOCKED_COMPANY_DAILY_OUTBOUNDS",
          recoverAtUtc: new Date(String(c.period_end_utc)),
        };
      }

      await new sql.Request(tx)
        .input("dayId", sql.UniqueIdentifier, dayId)
        .input("weekId", sql.UniqueIdentifier, weekId)
        .query(`
          UPDATE dbo.whatsapp_quota_employee_periods
          SET outbounds_reserved = outbounds_reserved + 1, updated_at = SYSUTCDATETIME()
          WHERE id IN (@dayId, @weekId);
        `);
      await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, companyId)
        .query(`
          UPDATE dbo.whatsapp_quota_company_periods
          SET outbounds_reserved = outbounds_reserved + 1, updated_at = SYSUTCDATETIME()
          WHERE id = @companyId;
        `);

      const insert = await new sql.Request(tx)
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("turnMessageSid", sql.NVarChar(64), input.turnMessageSid)
        .input("logicalKey", sql.NVarChar(160), input.logicalOutboundKey)
        .input("dayPeriodId", sql.UniqueIdentifier, dayId)
        .input("weekPeriodId", sql.UniqueIdentifier, weekId)
        .input("companyPeriodId", sql.UniqueIdentifier, companyId)
        .query(`
          INSERT INTO dbo.whatsapp_quota_outbound_reservations (
            company_id, employee_id, turn_message_sid, logical_outbound_key,
            status, day_period_id, week_period_id, company_period_id
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @employeeId, @turnMessageSid, @logicalKey,
            N'RESERVED', @dayPeriodId, @weekPeriodId, @companyPeriodId
          );
        `);

      await tx.commit();
      return { ok: true, reservationId: String(insert.recordset[0].id), reused: false };
    } catch (error) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      if (isDuplicateKeyError(error)) {
        const again = await getPool()
          .request()
          .input("key", sql.NVarChar(160), input.logicalOutboundKey)
          .query(
            `SELECT TOP 1 id FROM dbo.whatsapp_quota_outbound_reservations WHERE logical_outbound_key = @key`,
          );
        if (again.recordset[0]) {
          return { ok: true, reservationId: String(again.recordset[0].id), reused: true };
        }
      }
      throw error;
    }
  },

  async markOutboundAttemptStarted(reservationId: string): Promise<boolean> {
    const result = await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, reservationId)
      .query(`
        UPDATE dbo.whatsapp_quota_outbound_reservations
        SET status = N'ATTEMPT_STARTED', updated_at = SYSUTCDATETIME()
        WHERE id = @id AND status = N'RESERVED';
        SELECT @@ROWCOUNT AS affected;
      `);
    return Number(result.recordset[0]?.affected ?? 0) > 0;
  },

  /**
   * TwiML committed to HTTP response body — consumes outbound units but is NOT
   * provider delivery confirmation (use ACCEPTED when Twilio MessageSid is known).
   */
  async markOutboundResponseBuilt(reservationId: string): Promise<void> {
    await this.finalizeOutboundReservation({
      reservationId,
      terminalStatus: "RESPONSE_BUILT",
      providerMessageSid: null,
    });
  },

  async markOutboundAccepted(input: {
    reservationId: string;
    providerMessageSid?: string | null;
  }): Promise<void> {
    await this.finalizeOutboundReservation({
      reservationId: input.reservationId,
      terminalStatus: "ACCEPTED",
      providerMessageSid: input.providerMessageSid ?? null,
    });
  },

  async finalizeOutboundReservation(input: {
    reservationId: string;
    terminalStatus: "ACCEPTED" | "RESPONSE_BUILT";
    providerMessageSid: string | null;
  }): Promise<void> {
    const pool = getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const rowResult = await new sql.Request(tx)
        .input("id", sql.UniqueIdentifier, input.reservationId)
        .query(`
          SELECT status, day_period_id, week_period_id, company_period_id
          FROM dbo.whatsapp_quota_outbound_reservations WITH (UPDLOCK, ROWLOCK)
          WHERE id = @id;
        `);
      const row = rowResult.recordset[0] as Record<string, unknown> | undefined;
      if (!row) {
        await tx.rollback();
        return;
      }
      const status = String(row.status);
      if (status === "ACCEPTED" || status === "RESPONSE_BUILT") {
        if (input.terminalStatus === "ACCEPTED" && status === "RESPONSE_BUILT") {
          await new sql.Request(tx)
            .input("id", sql.UniqueIdentifier, input.reservationId)
            .input("sid", sql.NVarChar(64), input.providerMessageSid)
            .query(`
              UPDATE dbo.whatsapp_quota_outbound_reservations
              SET status = N'ACCEPTED',
                  provider_message_sid = COALESCE(@sid, provider_message_sid),
                  updated_at = SYSUTCDATETIME()
              WHERE id = @id;
            `);
        }
        await tx.commit();
        return;
      }
      if (status !== "RESERVED" && status !== "ATTEMPT_STARTED") {
        await tx.commit();
        return;
      }

      await new sql.Request(tx)
        .input("id", sql.UniqueIdentifier, input.reservationId)
        .input("sid", sql.NVarChar(64), input.providerMessageSid)
        .input("status", sql.NVarChar(30), input.terminalStatus)
        .query(`
          UPDATE dbo.whatsapp_quota_outbound_reservations
          SET status = @status,
              provider_message_sid = COALESCE(@sid, provider_message_sid),
              updated_at = SYSUTCDATETIME()
          WHERE id = @id;
        `);

      if (row.day_period_id && row.week_period_id) {
        await new sql.Request(tx)
          .input("dayId", sql.UniqueIdentifier, String(row.day_period_id))
          .input("weekId", sql.UniqueIdentifier, String(row.week_period_id))
          .query(`
            UPDATE dbo.whatsapp_quota_employee_periods
            SET outbounds_reserved = CASE WHEN outbounds_reserved > 0 THEN outbounds_reserved - 1 ELSE 0 END,
                outbounds_consumed = outbounds_consumed + 1,
                updated_at = SYSUTCDATETIME()
            WHERE id IN (@dayId, @weekId);
          `);
      }
      if (row.company_period_id) {
        await new sql.Request(tx)
          .input("companyId", sql.UniqueIdentifier, String(row.company_period_id))
          .query(`
            UPDATE dbo.whatsapp_quota_company_periods
            SET outbounds_reserved = CASE WHEN outbounds_reserved > 0 THEN outbounds_reserved - 1 ELSE 0 END,
                outbounds_consumed = outbounds_consumed + 1,
                updated_at = SYSUTCDATETIME()
            WHERE id = @companyId;
          `);
      }

      await tx.commit();
    } catch (error) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw error;
    }
  },

  async insertShadowOutboundEvaluation(input: {
    companyId: string;
    employeeId: string;
    turnMessageSid: string;
    logicalOutboundKey: string;
    wouldAdmit: boolean;
    reasonCode: string;
  }): Promise<string> {
    const status = input.wouldAdmit ? "SHADOW_WOULD_ADMIT" : "SHADOW_WOULD_REJECT";
    try {
      const result = await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("turnMessageSid", sql.NVarChar(64), input.turnMessageSid)
        .input("logicalKey", sql.NVarChar(160), input.logicalOutboundKey)
        .input("status", sql.NVarChar(30), status)
        .input("reason", sql.NVarChar(80), input.reasonCode)
        .query(`
          INSERT INTO dbo.whatsapp_quota_outbound_reservations (
            company_id, employee_id, turn_message_sid, logical_outbound_key,
            status, reason_code
          )
          OUTPUT INSERTED.id
          VALUES (
            @companyId, @employeeId, @turnMessageSid, @logicalKey,
            @status, @reason
          );
        `);
      return String(result.recordset[0].id);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        const again = await getPool()
          .request()
          .input("key", sql.NVarChar(160), input.logicalOutboundKey)
          .query(
            `SELECT TOP 1 id FROM dbo.whatsapp_quota_outbound_reservations WHERE logical_outbound_key = @key`,
          );
        return String(again.recordset[0]?.id ?? `shadow-dup:${input.logicalOutboundKey}`);
      }
      throw error;
    }
  },

  /** Release only when no provider effect was attempted. */
  async releaseOutboundIfReserved(reservationId: string): Promise<boolean> {
    const pool = getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const rowResult = await new sql.Request(tx)
        .input("id", sql.UniqueIdentifier, reservationId)
        .query(`
          SELECT status, day_period_id, week_period_id, company_period_id
          FROM dbo.whatsapp_quota_outbound_reservations WITH (UPDLOCK, ROWLOCK)
          WHERE id = @id;
        `);
      const row = rowResult.recordset[0] as Record<string, unknown> | undefined;
      if (!row || String(row.status) !== "RESERVED") {
        await tx.rollback();
        return false;
      }
      await new sql.Request(tx)
        .input("id", sql.UniqueIdentifier, reservationId)
        .query(`
          UPDATE dbo.whatsapp_quota_outbound_reservations
          SET status = N'RELEASED', updated_at = SYSUTCDATETIME()
          WHERE id = @id AND status = N'RESERVED';
        `);
      if (row.day_period_id && row.week_period_id) {
        await new sql.Request(tx)
          .input("dayId", sql.UniqueIdentifier, String(row.day_period_id))
          .input("weekId", sql.UniqueIdentifier, String(row.week_period_id))
          .query(`
            UPDATE dbo.whatsapp_quota_employee_periods
            SET outbounds_reserved = CASE WHEN outbounds_reserved > 0 THEN outbounds_reserved - 1 ELSE 0 END,
                updated_at = SYSUTCDATETIME()
            WHERE id IN (@dayId, @weekId);
          `);
      }
      if (row.company_period_id) {
        await new sql.Request(tx)
          .input("companyId", sql.UniqueIdentifier, String(row.company_period_id))
          .query(`
            UPDATE dbo.whatsapp_quota_company_periods
            SET outbounds_reserved = CASE WHEN outbounds_reserved > 0 THEN outbounds_reserved - 1 ELSE 0 END,
                updated_at = SYSUTCDATETIME()
            WHERE id = @companyId;
          `);
      }
      await tx.commit();
      return true;
    } catch (error) {
      try {
        await tx.rollback();
      } catch {
        // ignore
      }
      throw error;
    }
  },

  async markOutboundAmbiguous(reservationId: string): Promise<void> {
    await getPool()
      .request()
      .input("id", sql.UniqueIdentifier, reservationId)
      .query(`
        UPDATE dbo.whatsapp_quota_outbound_reservations
        SET status = N'AMBIGUOUS', updated_at = SYSUTCDATETIME()
        WHERE id = @id AND status IN (N'RESERVED', N'ATTEMPT_STARTED', N'AMBIGUOUS');
      `);
  },

  async claimLimitNotice(input: {
    companyId: string;
    employeeId: string;
    episodeKey: string;
    blockingReason: string;
    recoverAtUtc: Date | null;
  }): Promise<"claimed" | "exists"> {
    try {
      await getPool()
        .request()
        .input("companyId", sql.UniqueIdentifier, input.companyId)
        .input("employeeId", sql.UniqueIdentifier, input.employeeId)
        .input("episodeKey", sql.NVarChar(160), input.episodeKey)
        .input("blockingReason", sql.NVarChar(80), input.blockingReason)
        .input("recoverAtUtc", sql.DateTime2, input.recoverAtUtc)
        .query(`
          INSERT INTO dbo.whatsapp_quota_limit_notices (
            company_id, employee_id, episode_key, status, blocking_reason, recover_at_utc
          ) VALUES (
            @companyId, @employeeId, @episodeKey, N'RESERVED', @blockingReason, @recoverAtUtc
          );
        `);
      return "claimed";
    } catch (error) {
      if (isDuplicateKeyError(error)) return "exists";
      throw error;
    }
  },

  async completeLimitNotice(input: {
    companyId: string;
    employeeId: string;
    episodeKey: string;
    status: "SENT" | "SUPPRESSED" | "AMBIGUOUS";
    providerMessageSid?: string | null;
  }): Promise<void> {
    await getPool()
      .request()
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("employeeId", sql.UniqueIdentifier, input.employeeId)
      .input("episodeKey", sql.NVarChar(160), input.episodeKey)
      .input("status", sql.NVarChar(30), input.status)
      .input("sid", sql.NVarChar(64), input.providerMessageSid ?? null)
      .query(`
        UPDATE dbo.whatsapp_quota_limit_notices
        SET status = @status,
            provider_message_sid = COALESCE(@sid, provider_message_sid),
            updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId
          AND employee_id = @employeeId
          AND episode_key = @episodeKey
          AND status = N'RESERVED';
      `);
  },
};
