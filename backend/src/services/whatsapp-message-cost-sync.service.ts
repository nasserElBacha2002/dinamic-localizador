import twilio from "twilio";
import { randomUUID } from "node:crypto";
import { env } from "../config/env";
import { whatsappMessageCostLedgerRepository } from "../repositories/whatsapp-message-cost-ledger.repository";
import { absDecimalString, normalizeDecimalString } from "../utils/money-decimal";

export interface CostSyncBatchResult {
  processed: number;
  confirmed: number;
  estimated: number;
  pending: number;
  unavailable: number;
  skipped: number;
  failed: number;
  leaseLost: number;
}

export interface TwilioMessagePriceSnapshot {
  price: string | null;
  priceUnit: string | null;
  status: string | null;
}

export type FetchTwilioMessagePrice = (
  messageSid: string,
) => Promise<TwilioMessagePriceSnapshot>;

let twilioClient: ReturnType<typeof twilio> | null = null;

const getTwilioClient = (): ReturnType<typeof twilio> => {
  if (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN) {
    throw new Error("TWILIO_CREDENTIALS_NOT_CONFIGURED");
  }
  if (!twilioClient) {
    twilioClient = twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
};

export const defaultFetchTwilioMessagePrice: FetchTwilioMessagePrice = async (messageSid) => {
  const client = getTwilioClient();
  const message = await client.messages(messageSid).fetch();
  return {
    price: message.price ?? null,
    priceUnit: message.priceUnit ?? null,
    status: message.status ?? null,
  };
};

const computeBackoffMs = (attemptCount: number, baseMs: number): number => {
  const cappedAttempt = Math.min(Math.max(attemptCount, 1), 8);
  return baseMs * 2 ** (cappedAttempt - 1);
};

const isRateLimitError = (error: unknown): boolean => {
  const status = (error as { status?: number; code?: number | string })?.status;
  const code = String((error as { code?: number | string })?.code ?? "");
  return status === 429 || code === "20429";
};

const isNotFoundError = (error: unknown): boolean => {
  const status = (error as { status?: number })?.status;
  const code = String((error as { code?: number | string })?.code ?? "");
  return status === 404 || code === "20404";
};

const isValidCurrency = (value: string | null): value is string =>
  Boolean(value && /^[A-Z]{3}$/.test(value));

/**
 * Fetches Twilio Message Resource price/price_unit.
 * Amounts are Twilio channel fees only (not Meta template conversation fees).
 * ESTIMATED requires an exact tariff match including country/region — never a global guess.
 */
export const whatsappMessageCostSyncService = {
  async processPendingBatch(
    limit = 10,
    options?: { fetchPrice?: FetchTwilioMessagePrice },
  ): Promise<CostSyncBatchResult> {
    const result: CostSyncBatchResult = {
      processed: 0,
      confirmed: 0,
      estimated: 0,
      pending: 0,
      unavailable: 0,
      skipped: 0,
      failed: 0,
      leaseLost: 0,
    };

    const fetchPrice = options?.fetchPrice ?? defaultFetchTwilioMessagePrice;
    const usingDefaultFetch = !options?.fetchPrice;

    if (usingDefaultFetch && (!env.TWILIO_ACCOUNT_SID || !env.TWILIO_AUTH_TOKEN)) {
      result.skipped = limit;
      await whatsappMessageCostLedgerRepository.recordHeartbeat({
        success: false,
        result: { ...result, reason: "TWILIO_CREDENTIALS_NOT_CONFIGURED" },
      });
      return result;
    }

    const maxAttempts = env.WHATSAPP_MESSAGE_COST_SYNC_MAX_ATTEMPTS;
    const leaseSeconds = Math.ceil(env.WHATSAPP_MESSAGE_COST_SYNC_LEASE_MS / 1000);
    const workerId = `cost-sync-${randomUUID()}`;

    for (let i = 0; i < limit; i += 1) {
      const claimed = await whatsappMessageCostLedgerRepository.claimNextPending(
        workerId,
        leaseSeconds,
        maxAttempts,
      );
      if (!claimed) {
        break;
      }

      result.processed += 1;
      const sid = claimed.providerMessageSid;
      if (!sid) {
        const ok = await whatsappMessageCostLedgerRepository.markUnavailable({
          id: claimed.id,
          leaseOwner: workerId,
          errorCode: "NO_PROVIDER_SID",
          errorMessage: "Claimed ledger row without MessageSid",
        });
        if (ok) {
          result.unavailable += 1;
        } else {
          result.leaseLost += 1;
          console.info("[whatsapp-message-cost-sync] lease lost on markUnavailable", {
            ledgerId: claimed.id,
          });
        }
        continue;
      }

      try {
        const message = await fetchPrice(sid);
        const priceRaw = normalizeDecimalString(message.price);
        const currencyRaw = message.priceUnit
          ? String(message.priceUnit).toUpperCase().slice(0, 3)
          : null;
        const providerStatus = message.status ? String(message.status).toLowerCase() : null;

        if (priceRaw !== null && isValidCurrency(currencyRaw)) {
          const amount = absDecimalString(priceRaw);
          const ok = await whatsappMessageCostLedgerRepository.markConfirmed({
            id: claimed.id,
            leaseOwner: workerId,
            priceAmount: amount,
            currency: currencyRaw,
            providerStatus,
            pricingCategory: "TWILIO_WHATSAPP_CHANNEL",
          });
          if (ok) {
            result.confirmed += 1;
          } else {
            result.leaseLost += 1;
            console.info("[whatsapp-message-cost-sync] lease lost on markConfirmed", {
              ledgerId: claimed.id,
            });
          }
          continue;
        }

        if (priceRaw !== null && !isValidCurrency(currencyRaw)) {
          const exhaustedInvalidCurrency = claimed.syncAttemptCount >= maxAttempts;
          if (exhaustedInvalidCurrency) {
            const ok = await whatsappMessageCostLedgerRepository.markUnavailable({
              id: claimed.id,
              leaseOwner: workerId,
              errorCode: "INVALID_CURRENCY",
              errorMessage: "Twilio Message.price present but price_unit missing/invalid",
              providerStatus,
            });
            if (ok) {
              result.unavailable += 1;
            } else {
              result.leaseLost += 1;
            }
            continue;
          }
        }

        const exhausted = claimed.syncAttemptCount >= maxAttempts;
        if (exhausted) {
          // Without destination region we refuse global tariff guesses.
          const ok = await whatsappMessageCostLedgerRepository.markUnavailable({
            id: claimed.id,
            leaseOwner: workerId,
            errorCode: "PRICE_NOT_AVAILABLE",
            errorMessage:
              "Twilio Message.price empty after max attempts; ESTIMATED requires region-matched tariff",
            providerStatus,
          });
          if (ok) {
            result.unavailable += 1;
          } else {
            result.leaseLost += 1;
          }
          continue;
        }

        const nextSyncAt = new Date(
          Date.now() +
            computeBackoffMs(
              claimed.syncAttemptCount,
              env.WHATSAPP_MESSAGE_COST_SYNC_RETRY_BASE_MS,
            ),
        );
        const ok = await whatsappMessageCostLedgerRepository.markPendingRetry({
          id: claimed.id,
          leaseOwner: workerId,
          nextSyncAt,
          errorCode: "PRICE_PENDING",
          errorMessage: "Twilio Message.price not yet populated",
          providerStatus,
        });
        if (ok) {
          result.pending += 1;
        } else {
          result.leaseLost += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isNotFoundError(error)) {
          const ok = await whatsappMessageCostLedgerRepository.markUnavailable({
            id: claimed.id,
            leaseOwner: workerId,
            errorCode: "TWILIO_MESSAGE_NOT_FOUND",
            errorMessage: message.slice(0, 500),
          });
          if (ok) {
            result.unavailable += 1;
          } else {
            result.leaseLost += 1;
          }
          continue;
        }

        const exhausted = claimed.syncAttemptCount >= maxAttempts;
        if (exhausted) {
          const ok = await whatsappMessageCostLedgerRepository.markUnavailable({
            id: claimed.id,
            leaseOwner: workerId,
            errorCode: isRateLimitError(error) ? "TWILIO_RATE_LIMIT" : "TWILIO_FETCH_FAILED",
            errorMessage: message.slice(0, 500),
          });
          if (ok) {
            result.unavailable += 1;
          } else {
            result.leaseLost += 1;
          }
          continue;
        }

        const nextSyncAt = new Date(
          Date.now() +
            computeBackoffMs(
              claimed.syncAttemptCount,
              env.WHATSAPP_MESSAGE_COST_SYNC_RETRY_BASE_MS,
            ),
        );
        const ok = await whatsappMessageCostLedgerRepository.markPendingRetry({
          id: claimed.id,
          leaseOwner: workerId,
          nextSyncAt,
          errorCode: isRateLimitError(error) ? "TWILIO_RATE_LIMIT" : "TWILIO_FETCH_FAILED",
          errorMessage: message.slice(0, 500),
        });
        if (ok) {
          result.failed += 1;
          result.pending += 1;
        } else {
          result.leaseLost += 1;
        }
      }
    }

    await whatsappMessageCostLedgerRepository.recordHeartbeat({
      success: result.failed === 0,
      result: { ...result },
    });

    return result;
  },
};
