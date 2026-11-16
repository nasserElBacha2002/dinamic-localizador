import sql from "mssql";
import {
  BILLING_LAUNCH_FIXED_MONTHLY_USD,
  BILLING_LAUNCH_INCLUDED_SEAT_MAX,
  BILLING_LAUNCH_INCLUDED_SEAT_MIN,
  BILLING_LAUNCH_PLAN_CODE,
  BILLING_LAUNCH_PLAN_DISPLAY_NAME,
  BILLING_LAUNCH_PLAN_SORT_ORDER,
  BILLING_LAUNCH_TIER_CODE,
  BILLING_LAUNCH_TIER_DISPLAY_NAME,
} from "../../constants/billing-launch-plan";
import { AppError } from "../../errors/app-error";
import { getPool } from "../../database/connection";
import { billingPlanPriceRepository } from "../../repositories/billing/billing-plan-price.repository";
import { billingPlanTierRepository } from "../../repositories/billing/billing-plan-tier.repository";
import { billingPlanRepository } from "../../repositories/billing/billing-plan.repository";
import type { BillingPlan, BillingPlanPrice, BillingPlanTier } from "../../types/billing-catalog";
import { launchPlanFixedMonthlyUsd } from "../../utils/billing/launch-plan-contract";
import {
  classifyLaunchTierPriceCatalogState,
  type LaunchTierPriceCatalogState,
} from "../../utils/billing/launch-catalog-price-state";
import { doSeatRangesOverlap } from "../../utils/billing/tier-seat-range";
import { normalizeDecimalString } from "../../utils/money-decimal";
import { acquireTransactionAppLock } from "../../utils/sql-app-lock";
import { getDuplicateKeyConstraint, isDuplicateKeyError } from "../../utils/sql-server-errors";

export class BillingLaunchPlanSeedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingLaunchPlanSeedError";
  }
}

export class BillingLaunchPlanSeedInjectedFailure extends Error {
  constructor(stage: "plan" | "tier" | "price") {
    super(`BILLING_LAUNCH_PLAN_SEED_INJECTED_FAILURE:${stage}`);
    this.name = "BillingLaunchPlanSeedInjectedFailure";
  }
}

export interface BillingLaunchPlanSeedResult {
  planId: string;
  tierId: string;
  priceId: string | null;
  planInserted: boolean;
  tierInserted: boolean;
  priceInserted: boolean;
  publicOfferingEnabled: boolean;
  skippedExistingPlan: boolean;
  skippedExistingTier: boolean;
  skippedExistingOpenPrice: boolean;
  priceCatalogState: LaunchTierPriceCatalogState;
}

export interface LaunchPlanStructureExpectation {
  planCode: string;
  planKind: string;
  tierCode: string;
  seatMin: number;
  seatMax: number;
  monthlyUsd: string;
}

export const LAUNCH_PLAN_STRUCTURE_EXPECTATION: LaunchPlanStructureExpectation = {
  planCode: BILLING_LAUNCH_PLAN_CODE,
  planKind: "STANDARD",
  tierCode: BILLING_LAUNCH_TIER_CODE,
  seatMin: BILLING_LAUNCH_INCLUDED_SEAT_MIN,
  seatMax: BILLING_LAUNCH_INCLUDED_SEAT_MAX,
  monthlyUsd: launchPlanFixedMonthlyUsd(),
};

const amountMatches = (left: string, right: string): boolean =>
  (normalizeDecimalString(left) ?? "") === (normalizeDecimalString(right) ?? "");

const launchPlanSeedLockResource = (): string => "billing-launch-plan-catalog-seed";

const assertTierSeatRangeNoOverlap = (
  existingTiers: BillingPlanTier[],
  candidate: { seatMin: number; seatMax: number | null },
): void => {
  for (const tier of existingTiers) {
    if (
      doSeatRangesOverlap({
        seatMin: candidate.seatMin,
        seatMax: candidate.seatMax,
        otherSeatMin: tier.seatMin,
        otherSeatMax: tier.seatMax,
      })
    ) {
      throw new BillingLaunchPlanSeedError(
        "Launch tier seat range overlaps an existing active tier.",
      );
    }
  }
};

export const validateExistingLaunchPlanStructure = (input: {
  plan: BillingPlan;
  tiers: BillingPlanTier[];
  expectation?: LaunchPlanStructureExpectation;
  enforceInitialTierCapacity?: boolean;
}): BillingPlanTier => {
  const expectation = input.expectation ?? LAUNCH_PLAN_STRUCTURE_EXPECTATION;

  if (input.plan.planCode !== expectation.planCode) {
    throw new BillingLaunchPlanSeedError(
      `Launch plan code mismatch: expected ${expectation.planCode}, found ${input.plan.planCode}.`,
    );
  }
  if (input.plan.planKind !== expectation.planKind) {
    throw new BillingLaunchPlanSeedError(
      `Launch plan kind mismatch: expected ${expectation.planKind}, found ${input.plan.planKind}.`,
    );
  }

  const matchingTier = input.tiers.find(
    (tier) => tier.tierCode === expectation.tierCode && tier.isActive,
  );
  if (!matchingTier) {
    throw new BillingLaunchPlanSeedError(
      `Launch tier ${expectation.tierCode} is missing or inactive on plan ${expectation.planCode}.`,
    );
  }

  const conflictingActiveTiers = input.tiers.filter(
    (tier) =>
      tier.isActive &&
      tier.id !== matchingTier.id &&
      tier.tierCode !== expectation.tierCode,
  );
  if (conflictingActiveTiers.length > 0) {
    throw new BillingLaunchPlanSeedError(
      `Launch plan ${expectation.planCode} has unexpected active tiers: ${conflictingActiveTiers
        .map((tier) => tier.tierCode)
        .join(", ")}.`,
    );
  }

  if (input.enforceInitialTierCapacity) {
    if (
      matchingTier.seatMin !== expectation.seatMin ||
      matchingTier.seatMax !== expectation.seatMax
    ) {
      throw new BillingLaunchPlanSeedError(
        `Launch tier seat range mismatch: expected ${expectation.seatMin}-${expectation.seatMax}, got ${matchingTier.seatMin}-${matchingTier.seatMax ?? "∞"}.`,
      );
    }
  }

  return matchingTier;
};

export const validateOpenLaunchRegularPrice = (input: {
  openPrice: BillingPlanPrice | null;
  expectation?: LaunchPlanStructureExpectation;
  allowAdminModifiedAmount?: boolean;
}): void => {
  const expectation = input.expectation ?? LAUNCH_PLAN_STRUCTURE_EXPECTATION;
  if (!input.openPrice) {
    return;
  }
  if (input.openPrice.currency !== "USD" || input.openPrice.billingPeriod !== "MONTHLY") {
    throw new BillingLaunchPlanSeedError("Launch open price must be USD MONTHLY.");
  }
  if (input.openPrice.priceKind !== "REGULAR") {
    throw new BillingLaunchPlanSeedError("Launch catalog seed only manages REGULAR open prices.");
  }
  if (
    !input.allowAdminModifiedAmount &&
    !amountMatches(input.openPrice.amount, expectation.monthlyUsd)
  ) {
    throw new BillingLaunchPlanSeedError(
      `Launch open price amount mismatch: expected ${expectation.monthlyUsd} USD, found ${input.openPrice.amount}.`,
    );
  }
};

const mapDuplicateToSeedError = (error: unknown): never => {
  if (isDuplicateKeyError(error)) {
    const constraint = getDuplicateKeyConstraint(error)?.toUpperCase() ?? "";
    if (constraint.includes("UQ_BILLING_PLANS_PLAN_CODE")) {
      throw new BillingLaunchPlanSeedError("Launch plan already exists (duplicate plan code).");
    }
    if (constraint.includes("UQ_BILLING_PLAN_TIERS_PLAN_CODE")) {
      throw new BillingLaunchPlanSeedError("Launch tier already exists (duplicate tier code).");
    }
    if (constraint.includes("UX_BPP_OPEN_APPLICABILITY")) {
      throw new BillingLaunchPlanSeedError(
        "Launch price open applicability conflict; refusing duplicate open price.",
      );
    }
  }
  throw error;
};

/**
 * Idempotent launch catalog initialization in a single SQL transaction.
 * Does not deactivate legacy plans, alter subscriptions, or overwrite administratively changed prices.
 */
export const seedBillingLaunchPlan = async (input?: {
  initialPriceEffectiveFrom?: Date;
  strictInitialPrice?: boolean;
  testInjectFailureAfter?: "plan" | "tier" | "price";
}): Promise<BillingLaunchPlanSeedResult> => {
  const initialPriceEffectiveFrom =
    input?.initialPriceEffectiveFrom ?? new Date("2026-01-01T00:00:00.000Z");

  const pool = getPool();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  let planInserted = false;
  let tierInserted = false;
  let priceInserted = false;
  let publicOfferingEnabled = false;

  try {
    await new sql.Request(transaction).query(`SET XACT_ABORT ON;`);

    await acquireTransactionAppLock(transaction, {
      resource: launchPlanSeedLockResource(),
      timeoutError: new AppError(
        409,
        "BILLING_LAUNCH_PLAN_SEED_LOCK_TIMEOUT",
        "Launch plan seed lock timeout; retry on disposable database.",
      ),
    });

    let plan = await billingPlanRepository.findByCodeInTransaction(
      transaction,
      BILLING_LAUNCH_PLAN_CODE,
    );
    const planExisted = Boolean(plan);

    if (!plan) {
      plan = await billingPlanRepository.insertInTransaction(transaction, {
        planCode: BILLING_LAUNCH_PLAN_CODE,
        displayName: BILLING_LAUNCH_PLAN_DISPLAY_NAME,
        description:
          "Plan público de lanzamiento Dinamic Operations: tarifa mensual fija hasta la capacidad publicada del catálogo.",
        planKind: "STANDARD",
        sortOrder: BILLING_LAUNCH_PLAN_SORT_ORDER,
        isActive: true,
        isPublicForNewSubscription: true,
      });
      planInserted = true;
      publicOfferingEnabled = true;
    } else if (plan.isPublicForNewSubscription) {
      publicOfferingEnabled = true;
    }

    if (input?.testInjectFailureAfter === "plan") {
      throw new BillingLaunchPlanSeedInjectedFailure("plan");
    }

    let tiers = await billingPlanTierRepository.listByPlanIdInTransaction(transaction, plan.id);
    let includedTier: BillingPlanTier;
    const tierExisted = tiers.some(
      (tier) => tier.tierCode === BILLING_LAUNCH_TIER_CODE && tier.isActive,
    );

    if (!tierExisted) {
      if (tiers.some((tier) => tier.tierCode === BILLING_LAUNCH_TIER_CODE && !tier.isActive)) {
        throw new BillingLaunchPlanSeedError(
          `Launch tier ${BILLING_LAUNCH_TIER_CODE} exists but is inactive; refusing silent repair.`,
        );
      }

      const activeTiers = tiers.filter((tier) => tier.isActive);
      assertTierSeatRangeNoOverlap(activeTiers, {
        seatMin: BILLING_LAUNCH_INCLUDED_SEAT_MIN,
        seatMax: BILLING_LAUNCH_INCLUDED_SEAT_MAX,
      });

      includedTier = await billingPlanTierRepository.insert(
        plan.id,
        {
          tierCode: BILLING_LAUNCH_TIER_CODE,
          displayName: BILLING_LAUNCH_TIER_DISPLAY_NAME,
          seatMin: BILLING_LAUNCH_INCLUDED_SEAT_MIN,
          seatMax: BILLING_LAUNCH_INCLUDED_SEAT_MAX,
          sortOrder: 0,
          isActive: true,
        },
        transaction,
      );
      tierInserted = true;
      tiers = await billingPlanTierRepository.listByPlanIdInTransaction(transaction, plan.id);
    } else {
      includedTier = validateExistingLaunchPlanStructure({
        plan,
        tiers,
        enforceInitialTierCapacity: input?.strictInitialPrice === true,
      });
    }

    if (input?.testInjectFailureAfter === "tier") {
      throw new BillingLaunchPlanSeedInjectedFailure("tier");
    }

    const prices = await billingPlanPriceRepository.listByTierIdInTransaction(
      transaction,
      includedTier.id,
    );
    const openPrice = await billingPlanPriceRepository.findOpenByApplicabilityInTransaction(
      transaction,
      {
        billingPlanTierId: includedTier.id,
        currency: "USD",
        billingPeriod: "MONTHLY",
        priceKind: "REGULAR",
      },
    );

    const catalogReferenceAt = new Date();
    const priceCatalogState = classifyLaunchTierPriceCatalogState({
      prices,
      openPrice,
      initialAmountUsd: LAUNCH_PLAN_STRUCTURE_EXPECTATION.monthlyUsd,
      referenceAt: catalogReferenceAt,
    });

    if (openPrice) {
      validateOpenLaunchRegularPrice({
        openPrice,
        allowAdminModifiedAmount: input?.strictInitialPrice !== true,
      });
    } else if (priceCatalogState === "HISTORY_WITHOUT_OPEN") {
      throw new BillingLaunchPlanSeedError(
        "Launch tier has historical prices without an open regular row; refusing silent repair.",
      );
    } else if (priceCatalogState === "FUTURE_SCHEDULED_WITHOUT_OPEN") {
      throw new BillingLaunchPlanSeedError(
        "Launch tier has future scheduled prices without an open regular row; refusing to publish initial price.",
      );
    } else if (priceCatalogState === "EMPTY") {
      const created = await billingPlanPriceRepository.insertVersionInTransaction(transaction, {
        billingPlanTierId: includedTier.id,
        amount: BILLING_LAUNCH_FIXED_MONTHLY_USD,
        currency: "USD",
        billingPeriod: "MONTHLY",
        priceKind: "REGULAR",
        effectiveFrom: initialPriceEffectiveFrom,
        effectiveTo: null,
      });
      priceInserted = true;

      if (input?.testInjectFailureAfter === "price") {
        throw new BillingLaunchPlanSeedInjectedFailure("price");
      }

      await transaction.commit();

      return {
        planId: plan.id,
        tierId: includedTier.id,
        priceId: created.id,
        planInserted,
        tierInserted,
        priceInserted,
        publicOfferingEnabled,
        skippedExistingPlan: planExisted && !planInserted,
        skippedExistingTier: tierExisted && !tierInserted,
        skippedExistingOpenPrice: false,
        priceCatalogState: "OPEN_ONLY",
      };
    }

    if (input?.testInjectFailureAfter === "price") {
      throw new BillingLaunchPlanSeedInjectedFailure("price");
    }

    await transaction.commit();

    return {
      planId: plan.id,
      tierId: includedTier.id,
      priceId: openPrice?.id ?? null,
      planInserted,
      tierInserted,
      priceInserted,
      publicOfferingEnabled,
      skippedExistingPlan: planExisted && !planInserted,
      skippedExistingTier: tierExisted && !tierInserted,
      skippedExistingOpenPrice: Boolean(openPrice) && !priceInserted,
      priceCatalogState,
    };
  } catch (error) {
    try {
      await transaction.rollback();
    } catch {
      // XACT_ABORT may already have aborted the transaction.
    }
    if (error instanceof BillingLaunchPlanSeedError) {
      throw error;
    }
    if (error instanceof BillingLaunchPlanSeedInjectedFailure) {
      throw error;
    }
    return mapDuplicateToSeedError(error);
  }
};