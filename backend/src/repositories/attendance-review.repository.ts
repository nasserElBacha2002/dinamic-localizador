import sql from "mssql";
import { getPool } from "../database/connection";
import type { AttendanceReview } from "../types/auth";
import { getPagination } from "../utils/pagination";
import { mapAttendanceReviewRow } from "../utils/row-mappers";

export const attendanceReviewRepository = {
  async create(
    input: {
      attendanceId: string;
      reviewedBy: string;
      previousValidationStatus: string;
      newValidationStatus: string;
      decision: "APPROVE" | "REJECT";
      reason: string;
    },
    transaction?: sql.Transaction,
  ): Promise<AttendanceReview> {
    const request = transaction ? new sql.Request(transaction) : getPool().request();
    const result = await request
      .input("attendanceId", sql.UniqueIdentifier, input.attendanceId)
      .input("reviewedBy", sql.UniqueIdentifier, input.reviewedBy)
      .input("previousValidationStatus", sql.NVarChar(30), input.previousValidationStatus)
      .input("newValidationStatus", sql.NVarChar(30), input.newValidationStatus)
      .input("decision", sql.NVarChar(30), input.decision)
      .input("reason", sql.NVarChar(1000), input.reason)
      .query(`
        INSERT INTO attendance_reviews (
          attendance_id, reviewed_by, previous_validation_status,
          new_validation_status, decision, reason
        )
        OUTPUT INSERTED.*
        VALUES (
          @attendanceId, @reviewedBy, @previousValidationStatus,
          @newValidationStatus, @decision, @reason
        )
      `);

    return mapAttendanceReviewRow(result.recordset[0] as Record<string, unknown>);
  },

  async listByAttendanceId(attendanceId: string): Promise<AttendanceReview[]> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("attendanceId", sql.UniqueIdentifier, attendanceId)
      .query(`
        SELECT ar.*, u.name AS reviewer_name, u.email AS reviewer_email
        FROM attendance_reviews ar
        INNER JOIN users u ON u.id = ar.reviewed_by
        WHERE ar.attendance_id = @attendanceId
        ORDER BY ar.created_at ASC
      `);

    return result.recordset.map((row) =>
      mapAttendanceReviewRow(row as Record<string, unknown>),
    );
  },

  async listByAttendanceIdPaginated(
    attendanceId: string,
    page: number,
    limit: number,
  ): Promise<{ items: AttendanceReview[]; total: number }> {
    const pool = getPool();
    const { offset } = getPagination(page, limit);

    const countResult = await pool
      .request()
      .input("attendanceId", sql.UniqueIdentifier, attendanceId)
      .query(`
        SELECT COUNT(*) AS total
        FROM attendance_reviews
        WHERE attendance_id = @attendanceId
      `);

    const total = Number((countResult.recordset[0] as { total: number }).total ?? 0);

    const result = await pool
      .request()
      .input("attendanceId", sql.UniqueIdentifier, attendanceId)
      .input("offset", sql.Int, offset)
      .input("limit", sql.Int, limit)
      .query(`
        SELECT ar.*, u.name AS reviewer_name, u.email AS reviewer_email
        FROM attendance_reviews ar
        INNER JOIN users u ON u.id = ar.reviewed_by
        WHERE ar.attendance_id = @attendanceId
        ORDER BY ar.created_at ASC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `);

    return {
      items: result.recordset.map((row) =>
        mapAttendanceReviewRow(row as Record<string, unknown>),
      ),
      total,
    };
  },

  async hasReview(attendanceId: string): Promise<boolean> {
    const pool = getPool();
    const result = await pool
      .request()
      .input("attendanceId", sql.UniqueIdentifier, attendanceId)
      .query("SELECT TOP 1 1 AS found FROM attendance_reviews WHERE attendance_id = @attendanceId");

    return Boolean(result.recordset[0]);
  },
};
