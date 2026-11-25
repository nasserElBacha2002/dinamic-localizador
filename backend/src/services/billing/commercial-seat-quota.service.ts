import { randomUUID } from "node:crypto";
import sql from "mssql";
import type { CommercialSeatQuotaOperation } from "../../constants/commercial-seat-quota";
import { AppError } from "../../errors/app-error";
import { env } from "../../config/env";
import { billingPolicyService } from "./billing-policy.service";
import { billingSubscriptionRepository } from "../../repositories/billing/billing-subscription.repository";
import { billingSubscriptionTermRepository } from "../../repositories/billing/billing-subscription-term.repository";
import {
  commercialSeatQuotaEventRepository,
  type CommercialSeatQuotaEventInput,
} from "../../repositories/billing/commercial-seat-quota-event.repository";
import { companySettingsRepository } from "../../repositories/companies/company-settings.repository";
import { employeeRepository } from "../../repositories/employees/employee.repository";
import {
  acquireTransactionAppLock,
  commercialSeatCompanyLockResource,
} from "../../utils/sql-app-lock";
import {
  parseCommercialSeatQuotaMode,
  parseGlobalCommercialSeatQuotaMode,
  resolveEffectiveCommercialSeatMode,
} from "../../utils/billing/resolve-effective-commercial-seat-mode";
import { normalizeCompanyId } from "../../utils/billing/protected-company-exemption";
import { systemLogger } from "../../utils/system-logs/logger";
import { assertTransactionActiveForMutation } from "../../utils/sql-transaction-state";
import type {
  CommercialSeatAdmissionEvaluation,
  CommercialSeatCapacityKind,
} from "../../types/commercial-seat-quota";

export type CommercialSeatAdmissionInput = {
  companyId: string;
  transaction: sql.Transaction;
  delta: number;
  operation: CommercialSeatQuotaOperation;
  actorUserId?: string | null;
  correlationId?: string | null;
  lockPrepared?: {
    effectiveMode: CommercialSeatAdmissionEvaluation["effectiveMode"];
    lockAcquired: boolean;
  };
};

type CapacityResolution =
  | { kind: "UNLIMITED"; reasonCode: string; seatMax: null; subscriptionId: string; termId: string }
  | { kind: "FINITE"; reasonCode: string; seatMax: number; subscriptionId: string; termId: string }
  | { kind: "INCONSISTENCY"; reasonCode: string; subscriptionId: string | null; termId: string | null };

/**
 * DIN-463 lock order (documented; do not invert inside employee mutations):
 * 1. commercialSeatCompanyLockResource
 * 2. companyUserEmployeeLinkLockResource (employee update charge-holder flows)
 * 3. employee row UPDLOCK (employee-deactivation.repository)
 * Billing admin flows use billingSubscriptionCompanyLockResource separately — never nest inside employee tx.
 */

const toEvaluationId = (): string => randomUUID();

const buildEventInput = (
  evaluation: CommercialSeatAdmissionEvaluation,
  mutationPersisted: boolean,
): CommercialSeatQuotaEventInput => ({
  companyId: evaluation.companyId,
  operation: evaluation.operation,
  effectiveMode: evaluation.effectiveMode,
  capacityKind: evaluation.capacityKind,
  decision: evaluation.decision,
  reasonCode: evaluation.reasonCode,
  activeCountBefore: evaluation.activeCountBefore,
  deltaRequested: evaluation.deltaRequested,
  projectedCount: evaluation.projectedCount,
  seatMax: evaluation.seatMax,
  billingSubscriptionId: evaluation.billingSubscriptionId,
  billingSubscriptionTermId: evaluation.billingSubscriptionTermId,
  isExempt: evaluation.isExempt,
  enforceSeatLimit: evaluation.enforceSeatLimit,
  mutationPersisted,
  correlationId: evaluation.correlationId ?? evaluation.evaluationId,
  actorUserId: evaluation.actorUserId,
});

const flushEventSafe = async (input: CommercialSeatQuotaEventInput): Promise<void> => {
  try {
    await commercialSeatQuotaEventRepository.insertAutonomous(input);
  } catch (error) {
    systemLogger.warn({
      module: "billing",
      event: "commercial_seat_quota_event_persist_failed",
      message: "Failed to persist commercial seat quota decision event",
      error,
      metadata: { companyId: input.companyId, decision: input.decision },
    });
  }
};

const resolveCapacityInTransaction = async (
  transaction: sql.Transaction,
  companyId: string,
  referenceAt: Date,
): Promise<CapacityResolution> => {
  const subscription = await billingSubscriptionRepository.findVigentByCompanyIdInTransaction(
    transaction,
    companyId,
    referenceAt,
  );
  if (!subscription) {
    return {
      kind: "INCONSISTENCY",
      reasonCode: "NO_VIGENT_SUBSCRIPTION",
      subscriptionId: null,
      termId: null,
    };
  }

  const term = await billingSubscriptionTermRepository.findActiveAtInTransaction(
    transaction,
    subscription.id,
    referenceAt,
  );
  if (!term) {
    return {
      kind: "INCONSISTENCY",
      reasonCode: "NO_VIGENT_TERM",
      subscriptionId: subscription.id,
      termId: null,
    };
  }

  if (term.seatMax == null) {
    return {
      kind: "UNLIMITED",
      reasonCode: "UNLIMITED_SEAT_MAX",
      seatMax: null,
      subscriptionId: subscription.id,
      termId: term.id,
    };
  }

  return {
    kind: "FINITE",
    reasonCode: "CONTRACTUAL_SEAT_MAX",
    seatMax: term.seatMax,
    subscriptionId: subscription.id,
    termId: term.id,
  };
};

const tryAcquireCommercialSeatLock = async (
  transaction: sql.Transaction,
  companyId: string,
  effectiveMode: CommercialSeatAdmissionEvaluation["effectiveMode"],
): Promise<{ acquired: boolean; reasonCode: string | null }> => {
  try {
    await acquireTransactionAppLock(transaction, {
      resource: commercialSeatCompanyLockResource(companyId),
      timeoutError: new AppError(
        409,
        "COMMERCIAL_SEAT_LOCK_TIMEOUT",
        "No se pudo validar el cupo comercial. Reintentá.",
      ),
    });
    return { acquired: true, reasonCode: null };
  } catch (error) {
    if (!(error instanceof AppError)) {
      throw error;
    }
    if (
      effectiveMode === "OBSERVE" &&
      (error.code === "COMMERCIAL_SEAT_LOCK_TIMEOUT" ||
        error.code === "APP_LOCK_TIMEOUT" ||
        error.code === "APP_LOCK_DEADLOCK" ||
        error.code === "APP_LOCK_CANCELLED")
    ) {
      await assertTransactionActiveForMutation(transaction);
      return { acquired: false, reasonCode: error.code };
    }
    throw error;
  }
};

const skippedEvaluation = (
  companyId: string,
  operation: CommercialSeatQuotaOperation,
  effectiveMode: CommercialSeatAdmissionEvaluation["effectiveMode"],
  decision: CommercialSeatAdmissionEvaluation["decision"],
  reasonCode: string,
  delta: number,
  input: CommercialSeatAdmissionInput,
  partial?: Partial<CommercialSeatAdmissionEvaluation>,
): CommercialSeatAdmissionEvaluation => ({
  evaluationId: toEvaluationId(),
  companyId,
  operation,
  effectiveMode,
  capacityKind: partial?.capacityKind ?? "NOT_EVALUATED",
  decision,
  reasonCode,
  activeCountBefore: partial?.activeCountBefore ?? null,
  deltaRequested: delta,
  projectedCount: partial?.projectedCount ?? null,
  seatMax: partial?.seatMax ?? null,
  billingSubscriptionId: partial?.billingSubscriptionId ?? null,
  billingSubscriptionTermId: partial?.billingSubscriptionTermId ?? null,
  isExempt: partial?.isExempt ?? null,
  enforceSeatLimit: partial?.enforceSeatLimit ?? null,
  correlationId: input.correlationId ?? null,
  actorUserId: input.actorUserId ?? null,
  shouldBlockMutation: false,
});

export const commercialSeatQuotaService = {
  getGlobalMode() {
    return parseGlobalCommercialSeatQuotaMode(env.COMMERCIAL_SEAT_QUOTA_GLOBAL_MODE);
  },

  /**
   * Acquire commercial seat lock before employee row locks when quota may apply.
   */
  async prepareCommercialSeatAdmission(
    transaction: sql.Transaction,
    companyId: string,
  ): Promise<{
    effectiveMode: CommercialSeatAdmissionEvaluation["effectiveMode"];
    lockAcquired: boolean;
    prepErrorCode: string | null;
  }> {
    const normalized = normalizeCompanyId(companyId);
    const globalMode = this.getGlobalMode();
    if (globalMode === "DISABLED") {
      return { effectiveMode: "DISABLED", lockAcquired: false, prepErrorCode: null };
    }

    try {
      const settings = await companySettingsRepository.findByCompanyIdInTransaction(
        normalized,
        transaction,
        { admissionLock: true },
      );
      const companyMode = parseCommercialSeatQuotaMode(settings?.commercialSeatQuotaMode ?? null);
      const effectiveMode = resolveEffectiveCommercialSeatMode(globalMode, companyMode);
      if (effectiveMode === "DISABLED") {
        return { effectiveMode: "DISABLED", lockAcquired: false, prepErrorCode: null };
      }

      const lockResult = await tryAcquireCommercialSeatLock(transaction, normalized, effectiveMode);
      await assertTransactionActiveForMutation(transaction);
      return { effectiveMode, lockAcquired: lockResult.acquired, prepErrorCode: null };
    } catch (error) {
      if (error instanceof AppError && error.code === "SQL_TRANSACTION_UNUSABLE") {
        throw error;
      }
      const reasonCode =
        error instanceof AppError ? error.code : "COMMERCIAL_SEAT_PREPARE_FAILED";
      try {
        await assertTransactionActiveForMutation(transaction);
      } catch {
        if (error instanceof AppError) {
          throw error;
        }
        throw new AppError(409, "SQL_TRANSACTION_UNUSABLE", "La transacción quedó inválida.");
      }
      const fallbackMode =
        globalMode === "ENFORCE" ? "ENFORCE" : globalMode === "OBSERVE" ? "OBSERVE" : "DISABLED";
      return {
        effectiveMode: fallbackMode,
        lockAcquired: false,
        prepErrorCode: reasonCode,
      };
    }
  },

  async evaluateActiveHeadcountAdmissionInTransaction(
    input: CommercialSeatAdmissionInput,
  ): Promise<CommercialSeatAdmissionEvaluation | null> {
    const companyId = normalizeCompanyId(input.companyId);
    const delta = input.delta;
    if (!Number.isInteger(delta) || delta <= 0) {
      return null;
    }

    let effectiveMode = input.lockPrepared?.effectiveMode;
    let lockResult: { acquired: boolean; reasonCode: string | null };

    if (input.lockPrepared) {
      effectiveMode = input.lockPrepared.effectiveMode;
      lockResult = {
        acquired: input.lockPrepared.lockAcquired,
        reasonCode: input.lockPrepared.lockAcquired ? null : "APP_LOCK_NOT_ACQUIRED",
      };
    } else {
      const globalMode = this.getGlobalMode();
      if (globalMode === "DISABLED") {
        return null;
      }

      try {
        const settings = await companySettingsRepository.findByCompanyIdInTransaction(
          companyId,
          input.transaction,
          { admissionLock: true },
        );
        const companyMode = parseCommercialSeatQuotaMode(settings?.commercialSeatQuotaMode ?? null);
        effectiveMode = resolveEffectiveCommercialSeatMode(globalMode, companyMode);
      } catch {
        await assertTransactionActiveForMutation(input.transaction);
        const fallbackMode = globalMode === "OBSERVE" ? "OBSERVE" : "ENFORCE";
        const evaluation = skippedEvaluation(
          companyId,
          input.operation,
          fallbackMode,
          "EVALUATION_ERROR",
          "SETTINGS_READ_FAILED",
          delta,
          input,
        );
        evaluation.shouldBlockMutation = fallbackMode === "ENFORCE";
        return evaluation;
      }
      if (effectiveMode === "DISABLED") {
        return null;
      }

      lockResult = await tryAcquireCommercialSeatLock(input.transaction, companyId, effectiveMode!);
    }

    if (!effectiveMode || effectiveMode === "DISABLED") {
      return null;
    }

    let policy;
    try {
      policy = await billingPolicyService.getCompanyBillingPolicyInTransaction(
        input.transaction,
        companyId,
      );
    } catch {
      await assertTransactionActiveForMutation(input.transaction);
      const evaluation = skippedEvaluation(
        companyId,
        input.operation,
        effectiveMode,
        "EVALUATION_ERROR",
        "POLICY_RESOLUTION_FAILED",
        delta,
        input,
      );
      evaluation.shouldBlockMutation = effectiveMode === "ENFORCE";
      return evaluation;
    }

    if (policy.isExempt || !policy.enforceSeatLimit) {
      return skippedEvaluation(
        companyId,
        input.operation,
        effectiveMode,
        "SKIPPED",
        "COMMERCIAL_EXEMPTION",
        delta,
        input,
        {
          capacityKind: "EXEMPT",
          isExempt: policy.isExempt,
          enforceSeatLimit: policy.enforceSeatLimit,
        },
      );
    }

    if (!lockResult.acquired && effectiveMode === "OBSERVE") {
      await assertTransactionActiveForMutation(input.transaction);
      return skippedEvaluation(
        companyId,
        input.operation,
        effectiveMode,
        "EVALUATION_ERROR",
        lockResult.reasonCode ?? "APP_LOCK_NOT_ACQUIRED",
        delta,
        input,
        { capacityKind: "NOT_EVALUATED" },
      );
    }

    if (!lockResult.acquired) {
      const evaluation = skippedEvaluation(
        companyId,
        input.operation,
        effectiveMode,
        "EVALUATION_ERROR",
        lockResult.reasonCode ?? "APP_LOCK_NOT_ACQUIRED",
        delta,
        input,
      );
      evaluation.shouldBlockMutation = true;
      return evaluation;
    }

    let activeCountBefore: number | null = null;
    let projectedCount: number | null = null;
    try {
      activeCountBefore = await employeeRepository.countActiveInTransaction(
        companyId,
        input.transaction,
      );
      projectedCount = activeCountBefore + delta;
    } catch {
      await assertTransactionActiveForMutation(input.transaction);
      const evaluation = skippedEvaluation(
        companyId,
        input.operation,
        effectiveMode,
        "EVALUATION_ERROR",
        "ACTIVE_COUNT_FAILED",
        delta,
        input,
        { capacityKind: "NOT_EVALUATED" },
      );
      evaluation.shouldBlockMutation = effectiveMode === "ENFORCE";
      return evaluation;
    }

    let capacity: CapacityResolution;
    try {
      capacity = await resolveCapacityInTransaction(input.transaction, companyId, new Date());
    } catch {
      await assertTransactionActiveForMutation(input.transaction);
      const evaluation = skippedEvaluation(
        companyId,
        input.operation,
        effectiveMode,
        "EVALUATION_ERROR",
        "CAPACITY_RESOLUTION_FAILED",
        delta,
        input,
        {
          capacityKind: "NOT_EVALUATED",
          activeCountBefore,
          projectedCount,
          isExempt: null,
          enforceSeatLimit: null,
        },
      );
      evaluation.shouldBlockMutation = effectiveMode === "ENFORCE";
      return evaluation;
    }

    const base = (
      kind: CommercialSeatCapacityKind,
      decision: CommercialSeatAdmissionEvaluation["decision"],
      reasonCode: string,
      extra: Partial<CommercialSeatAdmissionEvaluation>,
    ): CommercialSeatAdmissionEvaluation => ({
      evaluationId: toEvaluationId(),
      companyId,
      operation: input.operation,
      effectiveMode,
      capacityKind: kind,
      decision,
      reasonCode,
      activeCountBefore,
      deltaRequested: delta,
      projectedCount,
      seatMax: extra.seatMax ?? null,
      billingSubscriptionId: extra.billingSubscriptionId ?? null,
      billingSubscriptionTermId: extra.billingSubscriptionTermId ?? null,
      isExempt: extra.isExempt ?? null,
      enforceSeatLimit: extra.enforceSeatLimit ?? null,
      correlationId: input.correlationId ?? null,
      actorUserId: input.actorUserId ?? null,
      shouldBlockMutation: extra.shouldBlockMutation ?? false,
    });

    if (capacity.kind === "INCONSISTENCY") {
      return base("INCONSISTENCY", "INCONSISTENCY", capacity.reasonCode, {
        billingSubscriptionId: capacity.subscriptionId,
        billingSubscriptionTermId: capacity.termId,
        isExempt: false,
        enforceSeatLimit: true,
      });
    }

    if (capacity.kind === "UNLIMITED") {
      return base("UNLIMITED", "ALLOWED", capacity.reasonCode, {
        seatMax: null,
        billingSubscriptionId: capacity.subscriptionId,
        billingSubscriptionTermId: capacity.termId,
        isExempt: false,
        enforceSeatLimit: true,
      });
    }

    const seatMax = capacity.seatMax;
    if (projectedCount > seatMax) {
      if (effectiveMode === "ENFORCE") {
        return base("FINITE", "REJECTED", "SEAT_LIMIT_EXCEEDED", {
          seatMax,
          billingSubscriptionId: capacity.subscriptionId,
          billingSubscriptionTermId: capacity.termId,
          isExempt: false,
          enforceSeatLimit: true,
          shouldBlockMutation: true,
        });
      }
      return base("FINITE", "WOULD_EXCEED", "SEAT_LIMIT_WOULD_EXCEED", {
        seatMax,
        billingSubscriptionId: capacity.subscriptionId,
        billingSubscriptionTermId: capacity.termId,
        isExempt: false,
        enforceSeatLimit: true,
      });
    }

    return base("FINITE", "ALLOWED", "WITHIN_SEAT_LIMIT", {
      seatMax,
      billingSubscriptionId: capacity.subscriptionId,
      billingSubscriptionTermId: capacity.termId,
      isExempt: false,
      enforceSeatLimit: true,
    });
  },

  throwIfAdmissionBlocked(evaluation: CommercialSeatAdmissionEvaluation | null): void {
    if (!evaluation?.shouldBlockMutation) {
      return;
    }
    if (evaluation.reasonCode === "SEAT_LIMIT_EXCEEDED") {
      throw new AppError(
        409,
        "COMMERCIAL_SEAT_LIMIT_EXCEEDED",
        "Se alcanzó la capacidad contractual de colaboradores activos.",
      );
    }
    throw new AppError(
      503,
      "COMMERCIAL_SEAT_CAPACITY_EVALUATION_FAILED",
      "No se pudo evaluar la capacidad contractual. Reintentá.",
    );
  },

  /**
   * Events are written on a separate pool connection (autonomous insert). A crash between commit and
   * insert can drop one ledger row; insert failures are logged and do not fail the employee mutation.
   */
  async flushAdmissionEvaluation(
    evaluation: CommercialSeatAdmissionEvaluation,
    mutationPersisted: boolean,
  ): Promise<void> {
    if (evaluation.effectiveMode === "DISABLED") {
      return;
    }
    const shouldRecord =
      evaluation.effectiveMode === "OBSERVE" ||
      evaluation.decision === "REJECTED" ||
      evaluation.decision === "EVALUATION_ERROR" ||
      evaluation.decision === "INCONSISTENCY" ||
      evaluation.decision === "WOULD_EXCEED" ||
      (evaluation.effectiveMode === "ENFORCE" &&
        mutationPersisted &&
        (evaluation.decision === "ALLOWED" || evaluation.decision === "SKIPPED" || evaluation.decision === "INCONSISTENCY"));
    if (!shouldRecord) {
      return;
    }
    await flushEventSafe(buildEventInput(evaluation, mutationPersisted));
  },
};