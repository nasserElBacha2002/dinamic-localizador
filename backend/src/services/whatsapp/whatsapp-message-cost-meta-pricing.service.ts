import { env } from "../../config/env";
import {
  META_TARIFF_CATEGORIES,
  type MetaBillingCategory,
} from "../../constants/whatsapp-message-cost";
import { whatsappMessageCostLedgerWriteRepository } from "../../repositories/whatsapp/whatsapp-message-cost-ledger-write.repository";
import { whatsappMessageCostTariffRepository } from "../../repositories/whatsapp/whatsapp-message-cost-tariff.repository";
import type { WhatsappMessageCostLedgerRow } from "../../repositories/whatsapp/whatsapp-message-cost-ledger.types";
import { DateTime } from "luxon";
import { getMonthUtcBounds } from "../../utils/month-utc-bounds";
import {
  decideMetaPricing,
  isEligibleServiceMessage,
} from "../../utils/whatsapp/whatsapp-meta-billing-policy";
import { whatsappMessageCostServiceMonthService } from "./whatsapp-message-cost-service-month.service";

const tariffCategoryFor = (
  category: MetaBillingCategory,
): string | null => {
  if (category === "NONE_INBOUND" || category === "UNCLASSIFIED") {
    return null;
  }
  return META_TARIFF_CATEGORIES[category];
};

const resolveCswOpen = (
  row: WhatsappMessageCostLedgerRow,
  options?: { customerServiceWindowOpen?: boolean | null },
): boolean | null => {
  if (options?.customerServiceWindowOpen !== undefined) {
    return options.customerServiceWindowOpen;
  }
  return row.metaCswOpen ?? null;
};

export const whatsappMessageCostMetaPricingService = {
  async refreshAfterChannelSync(ledgerId: string): Promise<void> {
    const row = await whatsappMessageCostLedgerWriteRepository.getById(ledgerId);
    if (!row?.metaBillingCategory) {
      return;
    }
    await this.applyForLedgerRow(row, { mode: "refreshAfterChannelSync" });
  },

  async applyForLedgerRow(
    row: WhatsappMessageCostLedgerRow,
    options?: {
      customerServiceWindowOpen?: boolean | null;
      mode?: "full" | "refreshAfterChannelSync";
    },
  ): Promise<boolean> {
    const mode = options?.mode ?? "full";
    const cswOpen = resolveCswOpen(row, options);
    const category = (row.metaBillingCategory ?? "UNCLASSIFIED") as MetaBillingCategory;

    if (
      mode === "full" &&
      !row.metaPricingLocked &&
      category === "SERVICE" &&
      !isEligibleServiceMessage({
        metaBillingCategory: category,
        customerServiceWindowOpen: cswOpen,
        messageKind: row.messageKind,
      })
    ) {
      return whatsappMessageCostLedgerWriteRepository.updateMetaPricing({
        id: row.id,
        metaBillingCategory: "UNCLASSIFIED",
        metaPriceAmount: null,
        metaCurrency: null,
        metaCostQuality: "UNAVAILABLE",
        metaCostSource: "NONE",
        metaTariffId: null,
        serviceMonthRank: null,
        metaCostNote: "SERVICE_NOT_ELIGIBLE_NO_CSW",
        metaBillable: false,
        metaCswOpen: cswOpen,
        lockMetaPricing: true,
      });
    }

    const billingCategory = category;

    let serviceMonthRank = row.serviceMonthRank;
    const eligibleService =
      billingCategory === "SERVICE" &&
      isEligibleServiceMessage({
        metaBillingCategory: billingCategory,
        customerServiceWindowOpen: cswOpen,
        messageKind: row.messageKind,
      });

    if (eligibleService && row.senderBillingKey) {
      const localSent = DateTime.fromJSDate(row.sentAt, { zone: "utc" }).setZone(
        env.BOT_OPERATION_TIMEZONE,
      );
      const bounds = getMonthUtcBounds(
        localSent.year,
        localSent.month,
        env.BOT_OPERATION_TIMEZONE,
      );
      const lockMetaPricing = mode === "full" && !row.metaPricingLocked;
      if (cswOpen !== row.metaCswOpen) {
        await whatsappMessageCostLedgerWriteRepository.updateMetaPricing({
          id: row.id,
          metaBillingCategory: billingCategory,
          metaPriceAmount: row.metaPriceAmount,
          metaCurrency: row.metaCurrency,
          metaCostQuality: row.metaCostQuality ?? "PENDING",
          metaCostSource: row.metaCostSource ?? "NONE",
          metaTariffId: row.metaTariffId,
          serviceMonthRank: row.serviceMonthRank,
          metaCostNote: row.metaCostNote,
          metaBillable: row.metaBillable ?? true,
          metaCswOpen: cswOpen,
          lockMetaPricing: false,
        });
      }
      await whatsappMessageCostServiceMonthService.recomputeRanksAndRepriceSenderMonth({
        senderBillingKey: row.senderBillingKey,
        monthStartUtc: bounds.monthStartUtc,
        nextMonthStartUtc: bounds.nextMonthStartUtc,
        focusId: row.id,
        preserveClassification:
          row.metaPricingLocked || mode === "refreshAfterChannelSync",
      });
      if (lockMetaPricing) {
        const refreshed = await whatsappMessageCostLedgerWriteRepository.getById(row.id);
        if (refreshed) {
          await whatsappMessageCostLedgerWriteRepository.updateMetaPricing({
            id: refreshed.id,
            metaBillingCategory: billingCategory,
            metaPriceAmount: refreshed.metaPriceAmount,
            metaCurrency: refreshed.metaCurrency,
            metaCostQuality: refreshed.metaCostQuality ?? "PENDING",
            metaCostSource: refreshed.metaCostSource ?? "NONE",
            metaTariffId: refreshed.metaTariffId,
            serviceMonthRank: refreshed.serviceMonthRank,
            metaCostNote: refreshed.metaCostNote,
            metaBillable: refreshed.metaBillable ?? true,
            metaCswOpen: cswOpen,
            lockMetaPricing: true,
          });
        }
      }
      return true;
    }

    const country = row.destinationCountryCode ?? "ZZ";
    const tariffCategory = tariffCategoryFor(billingCategory);
    let tariffAmount: string | null = null;
    let tariffCurrency: string | null = null;
    let tariffId: string | null = null;

    if (tariffCategory && country !== "ZZ") {
      const tariff = await whatsappMessageCostTariffRepository.findActiveTariff({
        category: tariffCategory,
        countryOrRegion: country,
        currency: "USD",
        at: row.sentAt,
      });
      if (tariff) {
        tariffAmount = tariff.amount;
        tariffCurrency = tariff.currency;
        tariffId = tariff.id;
      }
    }

    const decision = decideMetaPricing({
      metaBillingCategory: billingCategory,
      sentAt: row.sentAt,
      serviceMonthRank,
      tariffAmount,
      tariffCurrency,
      providerStatus: row.providerStatus,
      customerServiceWindowOpen: cswOpen,
    });

    const lockMetaPricing = mode === "full" && !row.metaPricingLocked;

    return whatsappMessageCostLedgerWriteRepository.updateMetaPricing({
      id: row.id,
      metaBillingCategory: billingCategory,
      metaPriceAmount: decision.metaPriceAmount,
      metaCurrency: decision.metaCurrency,
      metaCostQuality: decision.metaCostQuality,
      metaCostSource: decision.metaCostSource,
      metaTariffId: tariffId,
      serviceMonthRank: decision.serviceMonthRank,
      metaCostNote: decision.metaCostNote,
      metaBillable: decision.metaBillable,
      metaCswOpen: cswOpen,
      lockMetaPricing,
    });
  },
};