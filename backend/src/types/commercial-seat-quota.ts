import type {
  CommercialSeatQuotaDecision,
  CommercialSeatQuotaMode,
  CommercialSeatQuotaOperation,
} from "../constants/commercial-seat-quota";

export type CommercialSeatCapacityKind =
  | "NOT_EVALUATED"
  | "EXEMPT"
  | "FINITE"
  | "UNLIMITED"
  | "INCONSISTENCY";

/** Captures one admission evaluation; events are flushed only after tx end (no pool inside open tx). */
export type CommercialSeatAdmissionEvaluation = {
  evaluationId: string;
  companyId: string;
  operation: CommercialSeatQuotaOperation;
  effectiveMode: CommercialSeatQuotaMode;
  capacityKind: CommercialSeatCapacityKind;
  decision: CommercialSeatQuotaDecision;
  reasonCode: string;
  activeCountBefore: number | null;
  deltaRequested: number;
  projectedCount: number | null;
  /** null = unlimited or unknown (see capacityKind) */
  seatMax: number | null;
  billingSubscriptionId: string | null;
  billingSubscriptionTermId: string | null;
  isExempt: boolean | null;
  enforceSeatLimit: boolean | null;
  correlationId: string | null;
  actorUserId: string | null;
  shouldBlockMutation: boolean;
};