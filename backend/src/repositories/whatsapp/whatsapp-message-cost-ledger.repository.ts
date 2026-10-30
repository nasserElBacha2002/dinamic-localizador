/**
 * Compatibility facade over split ledger repositories.
 * Prefer importing write/claim/query/tariff modules directly in new code.
 */
import { whatsappMessageCostLedgerClaimRepository } from "./whatsapp-message-cost-ledger-claim.repository";
import { whatsappMessageCostLedgerQueryRepository } from "./whatsapp-message-cost-ledger-query.repository";
import { whatsappMessageCostLedgerWriteRepository } from "./whatsapp-message-cost-ledger-write.repository";
import { whatsappMessageCostTariffRepository } from "./whatsapp-message-cost-tariff.repository";

export type {
  CompanyBreakdownRow,
  CostLedgerFilters,
  CurrencyTotalRow,
  InsertCostLedgerInput,
  TemplateBreakdownRow,
  WhatsappMessageCostLedgerRow,
} from "./whatsapp-message-cost-ledger.types";

export const whatsappMessageCostLedgerRepository = {
  insertIgnoreDuplicate: whatsappMessageCostLedgerWriteRepository.insertIgnoreDuplicate,
  markConfirmed: whatsappMessageCostLedgerWriteRepository.markConfirmed,
  markEstimated: whatsappMessageCostLedgerWriteRepository.markEstimated,
  markPendingRetry: whatsappMessageCostLedgerWriteRepository.markPendingRetry,
  markUnavailable: whatsappMessageCostLedgerWriteRepository.markUnavailable,
  updateProviderStatusBySid: async (
    providerMessageSid: string,
    providerStatus: string,
  ): Promise<boolean> =>
    whatsappMessageCostLedgerWriteRepository.updateProviderStatusBySid({
      providerMessageSid,
      providerStatus,
    }),
  claimNextPending: whatsappMessageCostLedgerClaimRepository.claimNextPending,
  requestResync: whatsappMessageCostLedgerClaimRepository.requestResync,
  summarizeByCurrency: whatsappMessageCostLedgerQueryRepository.summarizeByCurrency,
  breakdownByCompany: whatsappMessageCostLedgerQueryRepository.breakdownByCompany,
  breakdownByTemplate: whatsappMessageCostLedgerQueryRepository.breakdownByTemplate,
  listDetail: whatsappMessageCostLedgerQueryRepository.listDetail,
  listForExport: whatsappMessageCostLedgerQueryRepository.listForExport,
  getLastSyncedAt: whatsappMessageCostLedgerQueryRepository.getLastSyncedAt,
  getHeartbeat: whatsappMessageCostLedgerQueryRepository.getHeartbeat,
  recordHeartbeat: whatsappMessageCostLedgerQueryRepository.recordHeartbeat,
  findActiveTariff: async (input: {
    category: string;
    at: Date;
    countryOrRegion?: string;
    currency?: string;
  }) => {
    if (!input.countryOrRegion) {
      return null;
    }
    return whatsappMessageCostTariffRepository.findActiveTariff({
      category: input.category,
      currency: input.currency,
      countryOrRegion: input.countryOrRegion,
      at: input.at,
    });
  },
};
