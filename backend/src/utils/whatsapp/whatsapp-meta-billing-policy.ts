import type { MessageCostKind } from "../../constants/whatsapp-message-cost";
import {
  META_SERVICE_FREE_MESSAGES_PER_SENDER_MONTH,
  META_SERVICE_FREE_TIER_EFFECTIVE_ISO,
  type MetaBillingCategory,
} from "../../constants/whatsapp-message-cost";
import type { MessageCostQuality } from "../../constants/whatsapp-message-cost";

export interface MetaPricingDecisionInput {
  metaBillingCategory: MetaBillingCategory;
  sentAt: Date;
  serviceMonthRank: number | null;
  tariffAmount: string | null;
  tariffCurrency: string | null;
  providerStatus: string | null;
  customerServiceWindowOpen: boolean | null;
}

export interface MetaPricingDecision {
  metaPriceAmount: string | null;
  metaCurrency: string | null;
  metaCostQuality: MessageCostQuality;
  metaCostSource: "META_POLICY" | "TARIFF_TABLE" | "NONE";
  metaCostNote: string | null;
  metaBillable: boolean;
  serviceMonthRank: number | null;
}

const isFailedDelivery = (status: string | null): boolean => {
  if (!status) {
    return false;
  }
  const normalized = status.toLowerCase();
  return normalized === "failed" || normalized === "undelivered";
};

export const isMetaServiceFreeTierActive = (sentAt: Date): boolean =>
  sentAt.getTime() >= new Date(META_SERVICE_FREE_TIER_EFFECTIVE_ISO).getTime();

export const isEligibleServiceMessage = (input: {
  metaBillingCategory: MetaBillingCategory;
  customerServiceWindowOpen: boolean | null;
  messageKind: MessageCostKind;
}): boolean => {
  if (input.metaBillingCategory !== "SERVICE") {
    return false;
  }
  if (input.messageKind === "BOT_TWIML" || input.messageKind === "TEXT") {
    return input.customerServiceWindowOpen === true;
  }
  return input.customerServiceWindowOpen !== false;
};

export const decideMetaPricing = (input: MetaPricingDecisionInput): MetaPricingDecision => {
  const failed = isFailedDelivery(input.providerStatus);
  if (failed) {
    return {
      metaPriceAmount: null,
      metaCurrency: null,
      metaCostQuality: "UNAVAILABLE",
      metaCostSource: "NONE",
      metaCostNote: "DELIVERY_FAILED_META_NOT_VERIFIED",
      metaBillable: false,
      serviceMonthRank: input.serviceMonthRank,
    };
  }

  if (input.metaBillingCategory === "NONE_INBOUND") {
    return {
      metaPriceAmount: "0",
      metaCurrency: null,
      metaCostQuality: "ESTIMATED",
      metaCostSource: "META_POLICY",
      metaCostNote: "INBOUND_NO_META_FEE_POLICY_ESTIMATED",
      metaBillable: false,
      serviceMonthRank: null,
    };
  }

  if (input.metaBillingCategory === "UNCLASSIFIED") {
    return {
      metaPriceAmount: null,
      metaCurrency: null,
      metaCostQuality: "UNAVAILABLE",
      metaCostSource: "NONE",
      metaCostNote: "UNCLASSIFIED_META_CATEGORY",
      metaBillable: false,
      serviceMonthRank: null,
    };
  }

  if (input.metaBillingCategory === "SERVICE") {
    if (!isMetaServiceFreeTierActive(input.sentAt)) {
      return {
        metaPriceAmount: "0",
        metaCurrency: input.tariffCurrency,
        metaCostQuality: "ESTIMATED",
        metaCostSource: "META_POLICY",
        metaCostNote: "PRE_OCT_2026_SERVICE_META_FREE",
        metaBillable: true,
        serviceMonthRank: input.serviceMonthRank,
      };
    }

    const rank = input.serviceMonthRank;
    if (rank === null) {
      return {
        metaPriceAmount: null,
        metaCurrency: null,
        metaCostQuality: "UNAVAILABLE",
        metaCostSource: "NONE",
        metaCostNote: "SERVICE_RANK_UNKNOWN",
        metaBillable: false,
        serviceMonthRank: null,
      };
    }

    if (rank <= META_SERVICE_FREE_MESSAGES_PER_SENDER_MONTH) {
      return {
        metaPriceAmount: "0",
        metaCurrency: input.tariffCurrency ?? "USD",
        metaCostQuality: "ESTIMATED",
        metaCostSource: "META_POLICY",
        metaCostNote: "SERVICE_FREE_TIER",
        metaBillable: true,
        serviceMonthRank: rank,
      };
    }

    if (input.tariffAmount !== null && input.tariffCurrency) {
      return {
        metaPriceAmount: input.tariffAmount,
        metaCurrency: input.tariffCurrency,
        metaCostQuality: "ESTIMATED",
        metaCostSource: "TARIFF_TABLE",
        metaCostNote: "SERVICE_ABOVE_FREE_TIER",
        metaBillable: true,
        serviceMonthRank: rank,
      };
    }

    return {
      metaPriceAmount: null,
      metaCurrency: null,
      metaCostQuality: "UNAVAILABLE",
      metaCostSource: "NONE",
      metaCostNote: "NO_META_TARIFF_FOR_SERVICE",
      metaBillable: true,
      serviceMonthRank: rank,
    };
  }

  if (input.tariffAmount !== null && input.tariffCurrency) {
    return {
      metaPriceAmount: input.tariffAmount,
      metaCurrency: input.tariffCurrency,
      metaCostQuality: "ESTIMATED",
      metaCostSource: "TARIFF_TABLE",
      metaCostNote: null,
      metaBillable: true,
      serviceMonthRank: null,
    };
  }

  return {
    metaPriceAmount: null,
    metaCurrency: null,
    metaCostQuality: "UNAVAILABLE",
    metaCostSource: "NONE",
    metaCostNote: `NO_META_TARIFF_${input.metaBillingCategory}`,
    metaBillable: true,
    serviceMonthRank: null,
  };
};