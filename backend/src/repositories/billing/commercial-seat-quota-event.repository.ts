import sql from "mssql";
import { randomUUID } from "node:crypto";
import { getPool } from "../../database/connection";
import type {
  CommercialSeatQuotaDecision,
  CommercialSeatQuotaMode,
  CommercialSeatQuotaOperation,
} from "../../constants/commercial-seat-quota";
import type { CommercialSeatCapacityKind } from "../../types/commercial-seat-quota";

export type CommercialSeatQuotaEventInput = {
  companyId: string;
  operation: CommercialSeatQuotaOperation;
  effectiveMode: CommercialSeatQuotaMode;
  capacityKind: CommercialSeatCapacityKind;
  decision: CommercialSeatQuotaDecision;
  reasonCode: string;
  activeCountBefore: number | null;
  deltaRequested: number;
  projectedCount: number | null;
  seatMax: number | null;
  billingSubscriptionId: string | null;
  billingSubscriptionTermId: string | null;
  isExempt: boolean | null;
  enforceSeatLimit: boolean | null;
  mutationPersisted: boolean;
  correlationId?: string | null;
  actorUserId?: string | null;
};

/**
 * Autonomous insert (separate from caller transaction) so rejected ENFORCE attempts survive rollback.
 */
export const commercialSeatQuotaEventRepository = {
  async insertAutonomous(input: CommercialSeatQuotaEventInput): Promise<void> {
    const pool = getPool();
    await pool
      .request()
      .input("id", sql.UniqueIdentifier, randomUUID())
      .input("companyId", sql.UniqueIdentifier, input.companyId)
      .input("operation", sql.NVarChar(40), input.operation)
      .input("effectiveMode", sql.NVarChar(20), input.effectiveMode)
      .input("capacityKind", sql.NVarChar(30), input.capacityKind)
      .input("decision", sql.NVarChar(30), input.decision)
      .input("reasonCode", sql.NVarChar(60), input.reasonCode)
      .input("activeCountBefore", sql.Int, input.activeCountBefore)
      .input("deltaRequested", sql.Int, input.deltaRequested)
      .input("projectedCount", sql.Int, input.projectedCount)
      .input("seatMax", sql.Int, input.seatMax)
      .input("billingSubscriptionId", sql.UniqueIdentifier, input.billingSubscriptionId)
      .input("billingSubscriptionTermId", sql.UniqueIdentifier, input.billingSubscriptionTermId)
      .input("isExempt", sql.Bit, input.isExempt == null ? null : input.isExempt ? 1 : 0)
      .input("enforceSeatLimit", sql.Bit, input.enforceSeatLimit == null ? null : input.enforceSeatLimit ? 1 : 0)
      .input("mutationPersisted", sql.Bit, input.mutationPersisted ? 1 : 0)
      .input("correlationId", sql.NVarChar(64), input.correlationId ?? null)
      .input("actorUserId", sql.UniqueIdentifier, input.actorUserId ?? null)
      .query(`
        INSERT INTO dbo.commercial_seat_quota_events (
          id,
          company_id,
          operation,
          effective_mode,
          capacity_kind,
          decision,
          reason_code,
          active_count_before,
          delta_requested,
          projected_count,
          seat_max,
          billing_subscription_id,
          billing_subscription_term_id,
          is_exempt,
          enforce_seat_limit,
          mutation_persisted,
          correlation_id,
          actor_user_id
        )
        VALUES (
          @id,
          @companyId,
          @operation,
          @effectiveMode,
          @capacityKind,
          @decision,
          @reasonCode,
          @activeCountBefore,
          @deltaRequested,
          @projectedCount,
          @seatMax,
          @billingSubscriptionId,
          @billingSubscriptionTermId,
          @isExempt,
          @enforceSeatLimit,
          @mutationPersisted,
          @correlationId,
          @actorUserId
        );
      `);
  },
};