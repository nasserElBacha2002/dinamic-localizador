import sql from "mssql";
import {
  BILLING_PERIODS,
  BILLING_PRICE_KINDS,
  type BillingPeriod,
  type BillingPriceKind,
} from "../../constants/billing-catalog";
import {
  BILLING_SUBSCRIPTION_OPEN_STATUSES,
  type BillingSubscriptionOpenStatus,
  type BillingSubscriptionStatus,
} from "../../constants/billing-subscription";
import { AppError } from "../../errors/app-error";
import { getPool } from "../../database/connection";
import { billingPlanPriceRepository } from "../../repositories/billing/billing-plan-price.repository";
import { billingPlanRepository } from "../../repositories/billing/billing-plan.repository";
import { billingPlanTierRepository } from "../../repositories/billing/billing-plan-tier.repository";
import { billingSubscriptionRepository } from "../../repositories/billing/billing-subscription.repository";
import { billingSubscriptionTermRepository } from "../../repositories/billing/billing-subscription-term.repository";
import { companyRepository } from "../../repositories/companies/company.repository";
import type {
  BillingSubscription,
  BillingSubscriptionTerm,
  BillingSubscriptionWithTerms,
} from "../../types/billing-subscription";
import {
  assertPositiveInteger,
  assertSeatCapacity,
  assertValidEffectiveInstant,
} from "../../utils/billing/catalog-input";
import { assertValidEffectiveRange } from "../../utils/billing/effective-period";
import {
  assertNoOpenSubscriptionOverlap,
  assertStandardTierAgreedCapacity,
  assertTermWithinSubscriptionPeriod,
  resolveTermEffectiveTo,
} from "../../utils/billing/subscription-period";
import { isDecimalString, normalizeDecimalString } from "../../utils/money-decimal";
import {
  acquireTransactionAppLock,
  billingSubscriptionCompanyLockResource,
} from "../../utils/sql-app-lock";
import { getDuplicateKeyConstraint, isDuplicateKeyError } from "../../utils/sql-server-errors";

const assertBillingPeriod = (billingPeriod: string): BillingPeriod => {
  if (!BILLING_PERIODS.includes(billingPeriod as BillingPeriod)) {
    throw new AppError(400, "BILLING_INVALID_PERIOD", "Período de facturación inválido.");
  }
  return billingPeriod as BillingPeriod;
};

const assertPriceKind = (priceKind: string): BillingPriceKind => {
  if (!BILLING_PRICE_KINDS.includes(priceKind as BillingPriceKind)) {
    throw new AppError(400, "BILLING_INVALID_PRICE_KIND", "Tipo de precio inválido.");
  }
  return priceKind as BillingPriceKind;
};

const assertOpenSubscriptionStatus = (status: string): BillingSubscriptionOpenStatus => {
  if (!BILLING_SUBSCRIPTION_OPEN_STATUSES.includes(status as BillingSubscriptionOpenStatus)) {
    throw new AppError(400, "BILLING_INVALID_SUBSCRIPTION_STATUS", "Estado de suscripción inválido.");
  }
  return status as BillingSubscriptionOpenStatus;
};

const normalizeCurrency = (currency: string): string => {
  const normalized = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new AppError(400, "BILLING_INVALID_CURRENCY", "Moneda inválida.");
  }
  return normalized;
};

const mapDuplicateSubscription = (error: unknown): AppError | null => {
  if (!isDuplicateKeyError(error)) {
    return null;
  }
  const constraint = getDuplicateKeyConstraint(error)?.toUpperCase() ?? "";
  if (constraint.includes("UX_BILLING_SUBSCRIPTIONS_COMPANY_ACTIVE")) {
    return new AppError(
      409,
      "BILLING_SUBSCRIPTION_ACTIVE_EXISTS",
      "La empresa ya tiene una suscripción activa.",
    );
  }
  if (constraint.includes("UX_BILLING_SUBSCRIPTIONS_COMPANY_SCHEDULED")) {
    return new AppError(
      409,
      "BILLING_SUBSCRIPTION_SCHEDULED_EXISTS",
      "La empresa ya tiene una suscripción programada.",
    );
  }
  if (constraint.includes("UX_BST_SUBSCRIPTION_OPEN_TERM")) {
    return new AppError(
      409,
      "BILLING_SUBSCRIPTION_TERM_OPEN",
      "Ya hay condiciones contractuales abiertas para esta suscripción.",
    );
  }
  return new AppError(409, "BILLING_DUPLICATE_KEY", "Conflicto de unicidad en suscripción comercial.");
};

const validateEffectiveRange = (effectiveFrom: Date, effectiveTo: Date | null | undefined): void => {
  try {
    assertValidEffectiveInstant(effectiveFrom);
    if (effectiveTo) {
      assertValidEffectiveInstant(effectiveTo);
    }
    assertValidEffectiveRange(effectiveFrom, effectiveTo ?? null);
  } catch {
    throw new AppError(400, "BILLING_INVALID_EFFECTIVE_RANGE", "Vigencia contractual inválida.");
  }
};

const resolveTierForPlan = async (input: {
  billingPlanId: string;
  billingPlanTierId: string | null | undefined;
  planKind: string;
}): Promise<{ tierId: string | null; seatMin: number; seatMax: number | null } | null> => {
  if (!input.billingPlanTierId) {
    if (input.planKind === "STANDARD") {
      throw new AppError(
        400,
        "BILLING_SUBSCRIPTION_TIER_REQUIRED",
        "Los planes estándar requieren un escalón del catálogo.",
      );
    }
    return null;
  }

  const tier = await billingPlanTierRepository.findById(input.billingPlanTierId);
  if (!tier) {
    throw new AppError(404, "BILLING_TIER_NOT_FOUND", "Escalón de plan no encontrado.");
  }
  if (tier.billingPlanId !== input.billingPlanId) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_TIER_PLAN_MISMATCH",
      "El escalón no pertenece al plan contratado.",
    );
  }

  return {
    tierId: tier.id,
    seatMin: tier.seatMin,
    seatMax: tier.seatMax,
  };
};

const parseAgreedAmount = (amount: string): string => {
  const normalized = normalizeDecimalString(amount);
  if (!normalized || !isDecimalString(normalized)) {
    throw new AppError(400, "BILLING_INVALID_AMOUNT", "Monto acordado inválido.");
  }
  return normalized;
};

const parseSeatCapacity = (seatMin: number, seatMax: number | null): void => {
  try {
    assertSeatCapacity(seatMin, seatMax);
  } catch {
    throw new AppError(400, "BILLING_INVALID_SEAT_RANGE", "Capacidad acordada inválida.");
  }
};

const wrapTermWithinSubscription = (
  subscription: { effectiveFrom: Date | string; effectiveTo: Date | string | null },
  termFrom: Date,
  termTo: Date | null,
): void => {
  try {
    assertTermWithinSubscriptionPeriod(subscription, termFrom, termTo);
  } catch {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_TERM_OUT_OF_PERIOD",
      "Las condiciones están fuera del período contractual de la suscripción.",
    );
  }
};

const validateCatalogPriceReference = async (input: {
  billingPlanPriceId?: string | null;
  billingPlanId: string;
  billingPlanTierId: string | null;
  currency: string;
  billingPeriod: BillingPeriod;
  priceKind: BillingPriceKind;
}): Promise<void> => {
  if (!input.billingPlanPriceId) {
    return;
  }

  const price = await billingPlanPriceRepository.findById(input.billingPlanPriceId);
  if (!price) {
    throw new AppError(404, "BILLING_PLAN_PRICE_NOT_FOUND", "Precio de catálogo no encontrado.");
  }

  const priceTier = await billingPlanTierRepository.findById(price.billingPlanTierId);
  if (!priceTier || priceTier.billingPlanId !== input.billingPlanId) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_CATALOG_PRICE_MISMATCH",
      "El precio de catálogo no corresponde al plan contratado.",
    );
  }

  if (input.billingPlanTierId && price.billingPlanTierId !== input.billingPlanTierId) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_CATALOG_PRICE_MISMATCH",
      "El precio de catálogo no corresponde al escalón contratado.",
    );
  }

  if (price.currency !== input.currency) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_CATALOG_PRICE_MISMATCH",
      "El precio de catálogo no corresponde a la moneda acordada.",
    );
  }

  if (price.billingPeriod !== input.billingPeriod) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_CATALOG_PRICE_MISMATCH",
      "El precio de catálogo no corresponde al período acordado.",
    );
  }

  if (price.priceKind !== input.priceKind) {
    throw new AppError(
      409,
      "BILLING_SUBSCRIPTION_CATALOG_PRICE_MISMATCH",
      "El precio de catálogo no corresponde al tipo de precio acordado.",
    );
  }
};

export const billingSubscriptionService = {
  async getCurrentSubscription(
    companyId: string,
    at?: Date,
  ): Promise<BillingSubscription | null> {
    return billingSubscriptionRepository.findVigentByCompanyId(companyId, at ?? new Date());
  },

  async getScheduledFutureSubscription(
    companyId: string,
    at?: Date,
  ): Promise<BillingSubscription | null> {
    return billingSubscriptionRepository.findScheduledFutureByCompanyId(companyId, at ?? new Date());
  },

  async listEndedSubscriptions(companyId: string, at?: Date): Promise<BillingSubscription[]> {
    return billingSubscriptionRepository.findEndedBeforeByCompanyId(companyId, at ?? new Date());
  },

  async listSubscriptionHistory(companyId: string): Promise<BillingSubscription[]> {
    return billingSubscriptionRepository.listByCompanyId(companyId);
  },

  async getSubscriptionWithTerms(subscriptionId: string): Promise<BillingSubscriptionWithTerms | null> {
    const subscription = await billingSubscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      return null;
    }
    const terms = await billingSubscriptionTermRepository.listBySubscriptionId(subscriptionId);
    return { ...subscription, terms };
  },

  async getCurrentTerms(
    subscriptionId: string,
    at?: Date,
  ): Promise<BillingSubscriptionTerm | null> {
    const subscription = await billingSubscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      throw new AppError(404, "BILLING_SUBSCRIPTION_NOT_FOUND", "Suscripción comercial no encontrada.");
    }
    return billingSubscriptionTermRepository.findActiveAt(subscriptionId, at ?? new Date());
  },

  async listTermsHistory(subscriptionId: string): Promise<BillingSubscriptionTerm[]> {
    const subscription = await billingSubscriptionRepository.findById(subscriptionId);
    if (!subscription) {
      throw new AppError(404, "BILLING_SUBSCRIPTION_NOT_FOUND", "Suscripción comercial no encontrada.");
    }
    return billingSubscriptionTermRepository.listBySubscriptionId(subscriptionId);
  },

  /**
   * Administrative creation of a company subscription with initial contractual terms.
   * Does not alter company operational status or modules.
   */
  async createAdminSubscription(input: {
    companyId: string;
    billingPlanId: string;
    billingPlanTierId?: string | null;
    subscriptionStatus?: BillingSubscriptionOpenStatus;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
    initialTerms: {
      agreedAmount: string;
      currency: string;
      billingPeriod: BillingPeriod;
      priceKind?: BillingPriceKind;
      seatMin?: number;
      seatMax?: number | null;
      billingPlanPriceId?: string | null;
      effectiveFrom?: Date;
      effectiveTo?: Date | null;
    };
  }): Promise<BillingSubscriptionWithTerms> {
    const company = await companyRepository.findById(input.companyId);
    if (!company) {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    }

    const plan = await billingPlanRepository.findById(input.billingPlanId);
    if (!plan) {
      throw new AppError(404, "BILLING_PLAN_NOT_FOUND", "Plan comercial no encontrado.");
    }

    const subscriptionStatus = assertOpenSubscriptionStatus(input.subscriptionStatus ?? "ACTIVE");
    validateEffectiveRange(input.effectiveFrom, input.effectiveTo);

    const tierResolution = await resolveTierForPlan({
      billingPlanId: plan.id,
      billingPlanTierId: input.billingPlanTierId,
      planKind: plan.planKind,
    });

    const billingPeriod = assertBillingPeriod(input.initialTerms.billingPeriod);
    const priceKind = assertPriceKind(input.initialTerms.priceKind ?? "REGULAR");
    const currency = normalizeCurrency(input.initialTerms.currency);
    const agreedAmount = parseAgreedAmount(input.initialTerms.agreedAmount);

    const customSeatsProvided =
      input.initialTerms.seatMin !== undefined || input.initialTerms.seatMax !== undefined;

    const seatMin = input.initialTerms.seatMin ?? tierResolution?.seatMin;
    const seatMax =
      input.initialTerms.seatMax === undefined
        ? (tierResolution?.seatMax ?? null)
        : input.initialTerms.seatMax;

    if (seatMin === undefined) {
      throw new AppError(
        400,
        "BILLING_SUBSCRIPTION_SEAT_CAPACITY_REQUIRED",
        "Debe indicar la capacidad acordada para planes personalizados.",
      );
    }
    parseSeatCapacity(seatMin, seatMax ?? null);

    if (tierResolution) {
      try {
        assertStandardTierAgreedCapacity(
          plan.planKind,
          { seatMin: tierResolution.seatMin, seatMax: tierResolution.seatMax },
          seatMin,
          seatMax ?? null,
          customSeatsProvided,
        );
      } catch {
        throw new AppError(
          409,
          "BILLING_SUBSCRIPTION_TIER_CAPACITY_MISMATCH",
          "La capacidad acordada no coincide con el escalón del plan estándar.",
        );
      }
    }

    await validateCatalogPriceReference({
      billingPlanPriceId: input.initialTerms.billingPlanPriceId,
      billingPlanId: plan.id,
      billingPlanTierId: tierResolution?.tierId ?? null,
      currency,
      billingPeriod,
      priceKind,
    });

    const termEffectiveFrom = input.initialTerms.effectiveFrom ?? input.effectiveFrom;
    const termEffectiveTo = resolveTermEffectiveTo(
      { effectiveTo: input.effectiveTo ?? null },
      input.initialTerms.effectiveTo,
    );
    wrapTermWithinSubscription(
      { effectiveFrom: input.effectiveFrom, effectiveTo: input.effectiveTo ?? null },
      termEffectiveFrom,
      termEffectiveTo,
    );
    validateEffectiveRange(termEffectiveFrom, termEffectiveTo);

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await acquireTransactionAppLock(transaction, {
        resource: billingSubscriptionCompanyLockResource(input.companyId),
        timeoutError: new AppError(
          409,
          "BILLING_SUBSCRIPTION_LOCK_TIMEOUT",
          "No se pudo registrar la suscripción. Reintentá.",
        ),
      });

      const openSubscriptions = await billingSubscriptionRepository.listOpenByCompanyForUpdate(
        input.companyId,
        transaction,
      );
      try {
        assertNoOpenSubscriptionOverlap({
          candidateFrom: input.effectiveFrom,
          candidateTo: input.effectiveTo ?? null,
          existing: openSubscriptions,
        });
      } catch {
        throw new AppError(
          409,
          "BILLING_SUBSCRIPTION_PERIOD_OVERLAP",
          "El período contractual se superpone con otra suscripción abierta.",
        );
      }

      const overlappingOpen =
        await billingSubscriptionRepository.findOverlappingOpenByCompanyInTransaction(transaction, {
          companyId: input.companyId,
          effectiveFrom: input.effectiveFrom,
          effectiveTo: input.effectiveTo ?? null,
        });
      if (overlappingOpen) {
        throw new AppError(
          409,
          "BILLING_SUBSCRIPTION_PERIOD_OVERLAP",
          "El período contractual se superpone con otra suscripción abierta.",
        );
      }

      const subscription = await billingSubscriptionRepository.insertInTransaction(transaction, {
        companyId: input.companyId,
        billingPlanId: plan.id,
        billingPlanTierId: tierResolution?.tierId ?? null,
        subscriptionStatus,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
      });

      const overlapping = await billingSubscriptionTermRepository.findOverlappingInTransaction(
        transaction,
        {
          billingSubscriptionId: subscription.id,
          effectiveFrom: termEffectiveFrom,
          effectiveTo: termEffectiveTo,
        },
      );
      if (overlapping) {
        throw new AppError(
          409,
          "BILLING_SUBSCRIPTION_TERM_OVERLAP",
          "Las condiciones contractuales se superponen con otra versión.",
        );
      }

      const term = await billingSubscriptionTermRepository.insertVersionInTransaction(transaction, {
        billingSubscriptionId: subscription.id,
        agreedAmount,
        currency,
        billingPeriod,
        priceKind,
        seatMin,
        seatMax: seatMax ?? null,
        billingPlanId: plan.id,
        billingPlanTierId: tierResolution?.tierId ?? null,
        billingPlanPriceId: input.initialTerms.billingPlanPriceId ?? null,
        effectiveFrom: termEffectiveFrom,
        effectiveTo: termEffectiveTo,
      });

      await transaction.commit();
      return { ...subscription, terms: [term] };
    } catch (error) {
      await transaction.rollback();
      const mapped = mapDuplicateSubscription(error);
      if (mapped) {
        throw mapped;
      }
      if (error instanceof AppError) {
        throw error;
      }
      throw error;
    }
  },

  /**
   * Publishes a new contractual term version. Never mutates agreed amounts on historical rows.
   */
  async registerContractualTerms(input: {
    subscriptionId: string;
    agreedAmount: string;
    currency: string;
    billingPeriod: BillingPeriod;
    priceKind?: BillingPriceKind;
    seatMin: number;
    seatMax?: number | null;
    billingPlanPriceId?: string | null;
    effectiveFrom: Date;
    effectiveTo?: Date | null;
  }): Promise<BillingSubscriptionTerm> {
    const prelim = await billingSubscriptionRepository.findById(input.subscriptionId);
    if (!prelim) {
      throw new AppError(404, "BILLING_SUBSCRIPTION_NOT_FOUND", "Suscripción comercial no encontrada.");
    }
    if (prelim.subscriptionStatus !== "ACTIVE" && prelim.subscriptionStatus !== "SCHEDULED") {
      throw new AppError(
        409,
        "BILLING_SUBSCRIPTION_NOT_OPEN",
        "No se pueden registrar condiciones en una suscripción finalizada.",
      );
    }

    const billingPeriod = assertBillingPeriod(input.billingPeriod);
    const priceKind = assertPriceKind(input.priceKind ?? "REGULAR");
    const currency = normalizeCurrency(input.currency);
    const agreedAmount = parseAgreedAmount(input.agreedAmount);
    const seatMax = input.seatMax === undefined ? null : input.seatMax;
    parseSeatCapacity(input.seatMin, seatMax);

    const plan = await billingPlanRepository.findById(prelim.billingPlanId);
    if (!plan) {
      throw new AppError(404, "BILLING_PLAN_NOT_FOUND", "Plan comercial no encontrado.");
    }
    if (prelim.billingPlanTierId) {
      const tier = await billingPlanTierRepository.findById(prelim.billingPlanTierId);
      if (!tier) {
        throw new AppError(404, "BILLING_TIER_NOT_FOUND", "Escalón de plan no encontrado.");
      }
      try {
        assertStandardTierAgreedCapacity(
          plan.planKind,
          { seatMin: tier.seatMin, seatMax: tier.seatMax },
          input.seatMin,
          seatMax,
          true,
        );
      } catch {
        throw new AppError(
          409,
          "BILLING_SUBSCRIPTION_TIER_CAPACITY_MISMATCH",
          "La capacidad acordada no coincide con el escalón del plan estándar.",
        );
      }
    }

    await validateCatalogPriceReference({
      billingPlanPriceId: input.billingPlanPriceId,
      billingPlanId: prelim.billingPlanId,
      billingPlanTierId: prelim.billingPlanTierId,
      currency,
      billingPeriod,
      priceKind,
    });

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await acquireTransactionAppLock(transaction, {
        resource: billingSubscriptionCompanyLockResource(prelim.companyId),
        timeoutError: new AppError(
          409,
          "BILLING_SUBSCRIPTION_LOCK_TIMEOUT",
          "No se pudieron registrar las condiciones. Reintentá.",
        ),
      });

      const subscription = await billingSubscriptionRepository.findByIdForUpdate(
        input.subscriptionId,
        transaction,
      );
      if (!subscription) {
        throw new AppError(404, "BILLING_SUBSCRIPTION_NOT_FOUND", "Suscripción comercial no encontrada.");
      }
      if (subscription.subscriptionStatus !== "ACTIVE" && subscription.subscriptionStatus !== "SCHEDULED") {
        throw new AppError(
          409,
          "BILLING_SUBSCRIPTION_NOT_OPEN",
          "No se pueden registrar condiciones en una suscripción finalizada.",
        );
      }

      const effectiveTo = resolveTermEffectiveTo(subscription, input.effectiveTo);
      validateEffectiveRange(input.effectiveFrom, effectiveTo);
      wrapTermWithinSubscription(subscription, input.effectiveFrom, effectiveTo);

      await billingSubscriptionTermRepository.closeTermsBeforeEffectiveInTransaction(transaction, {
        billingSubscriptionId: subscription.id,
        effectiveTo: input.effectiveFrom,
      });

      const overlapping = await billingSubscriptionTermRepository.findOverlappingInTransaction(
        transaction,
        {
          billingSubscriptionId: subscription.id,
          effectiveFrom: input.effectiveFrom,
          effectiveTo,
        },
      );
      if (overlapping) {
        throw new AppError(
          409,
          "BILLING_SUBSCRIPTION_TERM_OVERLAP",
          "Las condiciones contractuales se superponen con otra versión.",
        );
      }

      const created = await billingSubscriptionTermRepository.insertVersionInTransaction(transaction, {
        billingSubscriptionId: subscription.id,
        agreedAmount,
        currency,
        billingPeriod,
        priceKind,
        seatMin: input.seatMin,
        seatMax,
        billingPlanId: subscription.billingPlanId,
        billingPlanTierId: subscription.billingPlanTierId,
        billingPlanPriceId: input.billingPlanPriceId ?? null,
        effectiveFrom: input.effectiveFrom,
        effectiveTo,
      });

      await transaction.commit();
      return created;
    } catch (error) {
      await transaction.rollback();
      const mapped = mapDuplicateSubscription(error);
      if (mapped) {
        throw mapped;
      }
      if (error instanceof AppError) {
        throw error;
      }
      throw error;
    }
  },

  async finalizeSubscription(input: {
    subscriptionId: string;
    finalStatus?: Extract<BillingSubscriptionStatus, "ENDED" | "CANCELLED">;
    endedAt?: Date;
    effectiveTo?: Date | null;
  }): Promise<BillingSubscriptionWithTerms> {
    const prelim = await billingSubscriptionRepository.findById(input.subscriptionId);
    if (!prelim) {
      throw new AppError(404, "BILLING_SUBSCRIPTION_NOT_FOUND", "Suscripción comercial no encontrada.");
    }

    const finalStatus = input.finalStatus ?? "ENDED";
    if (finalStatus !== "ENDED" && finalStatus !== "CANCELLED") {
      throw new AppError(400, "BILLING_INVALID_SUBSCRIPTION_STATUS", "Estado de cierre inválido.");
    }

    const endedAt = input.endedAt ?? new Date();
    assertValidEffectiveInstant(endedAt);
    const subscriptionEffectiveTo = input.effectiveTo ?? endedAt;
    const subscriptionStart = new Date(prelim.effectiveFrom);
    validateEffectiveRange(subscriptionStart, subscriptionEffectiveTo);
    if (endedAt.getTime() < subscriptionStart.getTime()) {
      throw new AppError(
        400,
        "BILLING_INVALID_EFFECTIVE_RANGE",
        "La fecha de cierre no puede ser anterior al inicio del contrato.",
      );
    }
    if (subscriptionEffectiveTo.getTime() < subscriptionStart.getTime()) {
      throw new AppError(
        400,
        "BILLING_INVALID_EFFECTIVE_RANGE",
        "La vigencia contractual no puede terminar antes del inicio del contrato.",
      );
    }
    if (subscriptionEffectiveTo.getTime() > endedAt.getTime()) {
      throw new AppError(
        400,
        "BILLING_INVALID_EFFECTIVE_RANGE",
        "La vigencia contractual no puede extenderse más allá de la fecha de cierre administrativo.",
      );
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      await acquireTransactionAppLock(transaction, {
        resource: billingSubscriptionCompanyLockResource(prelim.companyId),
        timeoutError: new AppError(
          409,
          "BILLING_SUBSCRIPTION_LOCK_TIMEOUT",
          "No se pudo finalizar la suscripción. Reintentá.",
        ),
      });

      const openSubscription = await billingSubscriptionRepository.findByIdForUpdate(
        input.subscriptionId,
        transaction,
      );
      if (!openSubscription) {
        throw new AppError(404, "BILLING_SUBSCRIPTION_NOT_FOUND", "Suscripción comercial no encontrada.");
      }

      await billingSubscriptionTermRepository.closeAllTermsAtSubscriptionEndInTransaction(
        transaction,
        {
          billingSubscriptionId: openSubscription.id,
          subscriptionEffectiveTo,
          cancelledAt: endedAt,
        },
      );

      const subscription = await billingSubscriptionRepository.finalizeInTransaction(
        transaction,
        input.subscriptionId,
        {
          finalStatus,
          endedAt,
          effectiveTo: subscriptionEffectiveTo,
        },
      );

      const terms = await billingSubscriptionTermRepository.listBySubscriptionId(
        subscription.id,
        transaction,
      );

      await transaction.commit();
      return { ...subscription, terms };
    } catch (error) {
      await transaction.rollback();
      if (error instanceof AppError) {
        throw error;
      }
      throw error;
    }
  },
};
