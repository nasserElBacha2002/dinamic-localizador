import sql from "mssql";
import {
  BILLING_PERIODS,
  BILLING_PLAN_KINDS,
  BILLING_PRICE_KINDS,
  type BillingPeriod,
  type BillingPlanKind,
  type BillingPriceKind,
} from "../../constants/billing-catalog";
import { AppError } from "../../errors/app-error";
import { getPool } from "../../database/connection";
import { billingPlanPriceRepository } from "../../repositories/billing/billing-plan-price.repository";
import { billingPlanTierRepository } from "../../repositories/billing/billing-plan-tier.repository";
import { billingPlanRepository } from "../../repositories/billing/billing-plan.repository";
import type {
  BillingPlan,
  BillingPlanCatalogEntry,
  BillingPlanPrice,
  BillingPlanTier,
} from "../../types/billing-catalog";
import {
  assertPositiveInteger,
  assertSeatCapacity,
  assertValidEffectiveInstant,
} from "../../utils/billing/catalog-input";
import { assertValidEffectiveRange } from "../../utils/billing/effective-period";
import { doSeatRangesOverlap } from "../../utils/billing/tier-seat-range";
import { isDecimalString, normalizeDecimalString } from "../../utils/money-decimal";
import {
  acquireTransactionAppLock,
  billingPlanPriceLockResource,
  billingPlanTierLockResource,
} from "../../utils/sql-app-lock";
import { getDuplicateKeyConstraint, isDuplicateKeyError } from "../../utils/sql-server-errors";

const assertBillingPeriod = (billingPeriod: string): BillingPeriod => {
  if (!BILLING_PERIODS.includes(billingPeriod as BillingPeriod)) {
    throw new AppError(400, "BILLING_INVALID_PERIOD", "Período de facturación inválido.");
  }
  return billingPeriod as BillingPeriod;
};

const assertPlanKind = (planKind: string): BillingPlanKind => {
  if (!BILLING_PLAN_KINDS.includes(planKind as BillingPlanKind)) {
    throw new AppError(400, "BILLING_INVALID_PLAN_KIND", "Tipo de plan inválido.");
  }
  return planKind as BillingPlanKind;
};

const assertPriceKind = (priceKind: string): BillingPriceKind => {
  if (!BILLING_PRICE_KINDS.includes(priceKind as BillingPriceKind)) {
    throw new AppError(400, "BILLING_INVALID_PRICE_KIND", "Tipo de precio inválido.");
  }
  return priceKind as BillingPriceKind;
};

const normalizePlanCode = (planCode: string): string => {
  const normalized = planCode.trim().toUpperCase();
  if (!normalized || normalized.includes(" ")) {
    throw new AppError(400, "BILLING_INVALID_PLAN_CODE", "Código de plan inválido.");
  }
  return normalized;
};

const normalizeTierCode = (tierCode: string): string => {
  const normalized = tierCode.trim().toUpperCase();
  if (!normalized || normalized.includes(" ")) {
    throw new AppError(400, "BILLING_INVALID_TIER_CODE", "Código de escalón inválido.");
  }
  return normalized;
};

const normalizeCurrency = (currency: string): string => {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new AppError(400, "BILLING_INVALID_CURRENCY", "Moneda inválida.");
  }
  return normalized;
};

const mapDuplicatePlanCode = (error: unknown): AppError | null => {
  if (!isDuplicateKeyError(error)) {
    return null;
  }
  const constraint = getDuplicateKeyConstraint(error);
  if (constraint?.toUpperCase().includes("UQ_BILLING_PLANS_PLAN_CODE")) {
    return new AppError(409, "BILLING_PLAN_CODE_EXISTS", "Ya existe un plan con ese código.");
  }
  if (constraint?.toUpperCase().includes("UQ_BILLING_PLAN_TIERS_PLAN_CODE")) {
    return new AppError(409, "BILLING_TIER_CODE_EXISTS", "Ya existe un escalón con ese código en el plan.");
  }
  if (constraint?.toUpperCase().includes("UX_BPP_OPEN_APPLICABILITY")) {
    return new AppError(
      409,
      "BILLING_PRICE_OPEN_APPLICABILITY",
      "Ya hay un precio vigente abierto para este escalón, moneda, período y tipo de precio.",
    );
  }
  return new AppError(409, "BILLING_DUPLICATE_KEY", "Conflicto de unicidad en el catálogo de billing.");
};

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
      throw new AppError(
        409,
        "BILLING_TIER_SEAT_RANGE_OVERLAP",
        "El rango de colaboradores se superpone con otro escalón activo del plan.",
      );
    }
  }
};

const isPriceActiveAt = (price: BillingPlanPrice, at: Date): boolean => {
  const from = new Date(price.effectiveFrom);
  const to = price.effectiveTo ? new Date(price.effectiveTo) : null;
  return from.getTime() <= at.getTime() && (to === null || to.getTime() > at.getTime());
};

export const billingCatalogService = {
  async getCatalog(input?: { at?: Date; activeOnly?: boolean }): Promise<BillingPlanCatalogEntry[]> {
    const at = input?.at ?? new Date();
    const plans = await billingPlanRepository.list({ activeOnly: input?.activeOnly });
    const entries: BillingPlanCatalogEntry[] = [];

    for (const plan of plans) {
      const tiers = await billingPlanTierRepository.listByPlanId(plan.id);
      const tiersWithPrices = await Promise.all(
        tiers.map(async (tier) => {
          const prices = await billingPlanPriceRepository.listByTierId(tier.id);
          return {
            ...tier,
            prices: prices.filter((price) => isPriceActiveAt(price, at)),
          };
        }),
      );
      entries.push({ ...plan, tiers: tiersWithPrices });
    }

    return entries;
  },

  async createPlan(input: {
    planCode: string;
    displayName: string;
    description?: string | null;
    planKind?: BillingPlanKind;
    sortOrder?: number;
    isActive?: boolean;
  }): Promise<BillingPlan> {
    try {
      return await billingPlanRepository.insert({
        planCode: normalizePlanCode(input.planCode),
        displayName: input.displayName,
        description: input.description,
        planKind: input.planKind ? assertPlanKind(input.planKind) : "STANDARD",
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      });
    } catch (error) {
      const mapped = mapDuplicatePlanCode(error);
      if (mapped) {
        throw mapped;
      }
      throw error;
    }
  },

  async updatePlan(
    planId: string,
    input: {
      displayName?: string;
      description?: string | null;
      planKind?: BillingPlanKind;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): Promise<BillingPlan> {
    const existing = await billingPlanRepository.findById(planId);
    if (!existing) {
      throw new AppError(404, "BILLING_PLAN_NOT_FOUND", "Plan comercial no encontrado.");
    }

    return billingPlanRepository.updateMetadata(planId, {
      ...input,
      planKind: input.planKind ? assertPlanKind(input.planKind) : undefined,
    });
  },

  async createTier(
    planId: string,
    input: {
      tierCode: string;
      displayName: string;
      seatMin: number;
      seatMax: number | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): Promise<BillingPlanTier> {
    const plan = await billingPlanRepository.findById(planId);
    if (!plan) {
      throw new AppError(404, "BILLING_PLAN_NOT_FOUND", "Plan comercial no encontrado.");
    }

    try {
      assertSeatCapacity(input.seatMin, input.seatMax);
      if (input.sortOrder !== undefined) {
        assertPositiveInteger(input.sortOrder, "sortOrder");
      }
    } catch {
      throw new AppError(400, "BILLING_INVALID_SEAT_RANGE", "Rango de colaboradores inválido.");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await acquireTransactionAppLock(transaction, {
        resource: billingPlanTierLockResource(planId),
        timeoutError: new AppError(
          409,
          "BILLING_TIER_LOCK_TIMEOUT",
          "No se pudo registrar el escalón. Reintentá.",
        ),
      });

      const willBeActive = input.isActive !== false;
      if (willBeActive) {
        const activeTiers = await billingPlanTierRepository.listActiveByPlanForUpdate(
          planId,
          transaction,
        );
        assertTierSeatRangeNoOverlap(activeTiers, {
          seatMin: input.seatMin,
          seatMax: input.seatMax,
        });
      }

      const tier = await billingPlanTierRepository.insert(
        planId,
        {
          tierCode: normalizeTierCode(input.tierCode),
          displayName: input.displayName,
          seatMin: input.seatMin,
          seatMax: input.seatMax,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        },
        transaction,
      );

      await transaction.commit();
      return tier;
    } catch (error) {
      await transaction.rollback();
      const mapped = mapDuplicatePlanCode(error);
      if (mapped) {
        throw mapped;
      }
      throw error;
    }
  },

  async updateTier(
    tierId: string,
    input: {
      displayName?: string;
      seatMin?: number;
      seatMax?: number | null;
      sortOrder?: number;
      isActive?: boolean;
    },
  ): Promise<BillingPlanTier> {
    const prelimTier = await billingPlanTierRepository.findById(tierId);
    if (!prelimTier) {
      throw new AppError(404, "BILLING_TIER_NOT_FOUND", "Escalón de plan no encontrado.");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await acquireTransactionAppLock(transaction, {
        resource: billingPlanTierLockResource(prelimTier.billingPlanId),
        timeoutError: new AppError(
          409,
          "BILLING_TIER_LOCK_TIMEOUT",
          "No se pudo actualizar el escalón. Reintentá.",
        ),
      });

      const existing = await billingPlanTierRepository.findByIdForUpdate(tierId, transaction);
      if (!existing) {
        throw new AppError(404, "BILLING_TIER_NOT_FOUND", "Escalón de plan no encontrado.");
      }
      if (existing.billingPlanId !== prelimTier.billingPlanId) {
        throw new AppError(409, "BILLING_TIER_PLAN_CHANGED", "El escalón cambió durante la operación.");
      }

      const seatMin = input.seatMin ?? existing.seatMin;
      const seatMax = input.seatMax === undefined ? existing.seatMax : input.seatMax;
      try {
        assertSeatCapacity(seatMin, seatMax);
        if (input.sortOrder !== undefined) {
          assertPositiveInteger(input.sortOrder, "sortOrder");
        }
      } catch {
        throw new AppError(400, "BILLING_INVALID_SEAT_RANGE", "Rango de colaboradores inválido.");
      }

      const willBeActive = input.isActive === undefined ? existing.isActive : input.isActive;

      if (willBeActive) {
        const activeTiers = await billingPlanTierRepository.listActiveByPlanForUpdate(
          existing.billingPlanId,
          transaction,
          { excludeTierId: tierId },
        );
        assertTierSeatRangeNoOverlap(activeTiers, { seatMin, seatMax });
      }

      const tier = await billingPlanTierRepository.update(
        tierId,
        {
          displayName: input.displayName,
          seatMin,
          seatMax,
          sortOrder: input.sortOrder,
          isActive: input.isActive,
        },
        transaction,
      );

      await transaction.commit();
      return tier;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  },

  async listTierPriceHistory(tierId: string): Promise<BillingPlanPrice[]> {
    const tier = await billingPlanTierRepository.findById(tierId);
    if (!tier) {
      throw new AppError(404, "BILLING_TIER_NOT_FOUND", "Escalón de plan no encontrado.");
    }
    return billingPlanPriceRepository.listByTierId(tierId);
  },

  /**
   * Publishes a new price version. Closes the open row (effective_to) and inserts;
   * never updates amount/currency on historical rows.
   */
  async publishPriceVersion(input: {
    billingPlanTierId: string;
    amount: string;
    currency: string;
    billingPeriod: BillingPeriod;
    priceKind?: BillingPriceKind;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
  }): Promise<BillingPlanPrice> {
    const tier = await billingPlanTierRepository.findById(input.billingPlanTierId);
    if (!tier) {
      throw new AppError(404, "BILLING_TIER_NOT_FOUND", "Escalón de plan no encontrado.");
    }

    const billingPeriod = assertBillingPeriod(input.billingPeriod);
    const priceKind = assertPriceKind(input.priceKind ?? "REGULAR");
    const currency = normalizeCurrency(input.currency);
    const amount = normalizeDecimalString(input.amount);
    if (!amount || !isDecimalString(amount)) {
      throw new AppError(400, "BILLING_INVALID_AMOUNT", "Monto inválido.");
    }

    const effectiveTo = input.effectiveTo ?? null;
    try {
      assertValidEffectiveInstant(input.effectiveFrom);
      if (effectiveTo) {
        assertValidEffectiveInstant(effectiveTo);
      }
      assertValidEffectiveRange(input.effectiveFrom, effectiveTo);
    } catch {
      throw new AppError(400, "BILLING_INVALID_EFFECTIVE_RANGE", "Vigencia de precio inválida.");
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await acquireTransactionAppLock(transaction, {
        resource: billingPlanPriceLockResource(
          input.billingPlanTierId,
          currency,
          billingPeriod,
          priceKind,
        ),
        timeoutError: new AppError(
          409,
          "BILLING_PRICE_LOCK_TIMEOUT",
          "No se pudo publicar el precio. Reintentá.",
        ),
      });

      await billingPlanPriceRepository.closeOpenPricesBeforeInTransaction(transaction, {
        billingPlanTierId: input.billingPlanTierId,
        currency,
        billingPeriod,
        priceKind,
        effectiveTo: input.effectiveFrom,
      });

      const overlapping = await billingPlanPriceRepository.findOverlappingInTransaction(
        transaction,
        {
          billingPlanTierId: input.billingPlanTierId,
          currency,
          billingPeriod,
          priceKind,
          effectiveFrom: input.effectiveFrom,
          effectiveTo,
        },
      );
      if (overlapping) {
        throw new AppError(
          409,
          "BILLING_PRICE_PERIOD_OVERLAP",
          "La vigencia del precio se superpone con otra versión existente.",
        );
      }

      const created = await billingPlanPriceRepository.insertVersionInTransaction(transaction, {
        billingPlanTierId: input.billingPlanTierId,
        amount,
        currency,
        billingPeriod,
        priceKind,
        effectiveFrom: input.effectiveFrom,
        effectiveTo,
      });

      await transaction.commit();
      return created;
    } catch (error) {
      await transaction.rollback();
      const mapped = mapDuplicatePlanCode(error);
      if (mapped) {
        throw mapped;
      }
      throw error;
    }
  },
};
