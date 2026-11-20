import { createHash } from "node:crypto";
import { env } from "../../config/env";
import { AppError } from "../../errors/app-error";
import { getRateLimitStore } from "../../middleware/rate-limit";
import type { MarketingDemoRequestInput } from "../../schemas/marketing-demo.schema";
import { buildDemoLeadEmail } from "./demo-lead-email";
import { sendEmail } from "../email.service";
import { normalizeEmail } from "../../utils/password";
import {
  MARKETING_DEMO_DELIVERY_FAILED_CODE,
  MARKETING_DEMO_DELIVERY_UNCERTAIN_CODE,
  classifyMarketingSmtpResult,
  isDefinitiveMarketingDeliveryError,
} from "./demo-lead-smtp-outcome";

/** Test seam */
export const marketingDemoLeadMailer = {
  send: sendEmail,
};

export const DEMO_LEAD_SUCCESS_MESSAGE =
  "Recibimos tu solicitud. Te contactaremos a la brevedad.";

export type DemoLeadSubmitResult = {
  message: string;
  delivered: boolean;
};

const inFlightByFingerprint = new Map<string, Promise<DemoLeadSubmitResult>>();

function leadRecipient(): string {
  const configured = env.MARKETING_DEMO_LEAD_TO?.trim();
  if (!configured) {
    throw new AppError(
      503,
      "MARKETING_DEMO_UNAVAILABLE",
      "El envío de solicitudes no está disponible en este momento. Probá más tarde.",
    );
  }
  return normalizeEmail(configured);
}

export function fingerprint(lead: MarketingDemoRequestInput): string {
  const normalizedEmail = normalizeEmail(lead.email);
  const payload = [
    normalizedEmail,
    lead.company.trim().toLowerCase(),
    lead.fullName.trim().toLowerCase(),
    lead.employeeRange,
  ].join("|");
  return createHash("sha256").update(payload).digest("hex");
}

function dedupBucketKey(fingerprintHex: string): string {
  return `marketing-demo-dedup:${fingerprintHex}`;
}

async function releaseRateLimitBucket(key: string): Promise<void> {
  const store = getRateLimitStore();
  if (store.release) {
    await store.release(key);
  }
}

/**
 * Provisional dedup slot (max 1). Held after successful SMTP; released only on definitive rejection.
 * Cross-replica serialization uses the shared rate-limit store (SQL UPDLOCK when RATE_LIMIT_BACKEND=sql).
 */
async function beginDedupAttempt(fingerprintHex: string): Promise<void> {
  const windowMs = env.MARKETING_DEMO_DEDUP_WINDOW_MINUTES * 60_000;
  const key = dedupBucketKey(fingerprintHex);
  const result = await getRateLimitStore().hit(key, windowMs, 1);
  if (!result.allowed) {
    throw new AppError(
      409,
      "MARKETING_DEMO_DUPLICATE",
      "Ya recibimos una solicitud similar recientemente. Si necesitás ayuda urgente, escribinos por email.",
    );
  }
}

const DELIVERY_FAILED_MESSAGE =
  "No pudimos enviar tu solicitud en este momento. Probá de nuevo en unos minutos.";

const DELIVERY_UNCERTAIN_MESSAGE =
  "No pudimos confirmar el envío de tu solicitud. Esperá unos minutos antes de intentar de nuevo.";

async function deliverLead(lead: MarketingDemoRequestInput): Promise<DemoLeadSubmitResult> {
  const to = leadRecipient();
  const content = buildDemoLeadEmail({
    lead: { ...lead, email: normalizeEmail(lead.email) },
    to,
    submittedAt: new Date(),
  });

  let result;
  try {
    result = await marketingDemoLeadMailer.send({
      to: content.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
  } catch {
    console.error("[marketing-demo] smtp transport error", {
      code: "MARKETING_DEMO_SMTP_THROW",
    });
    throw new AppError(503, MARKETING_DEMO_DELIVERY_UNCERTAIN_CODE, DELIVERY_UNCERTAIN_MESSAGE);
  }

  const outcome = classifyMarketingSmtpResult(result);
  if (outcome.kind === "accepted") {
    console.info("[marketing-demo] lead delivered", {
      transport: outcome.result.transport,
      hasMessageId: Boolean(outcome.result.messageId),
    });
    return { message: DEMO_LEAD_SUCCESS_MESSAGE, delivered: true };
  }

  if (outcome.kind === "rejected") {
    console.error("[marketing-demo] smtp rejected", {
      code: outcome.result.publicErrorCode ?? "MARKETING_DEMO_SMTP_REJECTED",
      transport: outcome.result.transport,
      sent: outcome.result.sent,
    });
    throw new AppError(502, MARKETING_DEMO_DELIVERY_FAILED_CODE, DELIVERY_FAILED_MESSAGE);
  }

  throw new AppError(503, MARKETING_DEMO_DELIVERY_UNCERTAIN_CODE, DELIVERY_UNCERTAIN_MESSAGE);
}

async function submitInternal(lead: MarketingDemoRequestInput): Promise<DemoLeadSubmitResult> {
  if (lead.companyWebsite.trim().length > 0) {
    return { message: DEMO_LEAD_SUCCESS_MESSAGE, delivered: false };
  }

  const fp = fingerprint(lead);
  const dedupKey = dedupBucketKey(fp);
  await beginDedupAttempt(fp);

  try {
    return await deliverLead(lead);
  } catch (error) {
    if (error instanceof AppError && isDefinitiveMarketingDeliveryError(error.code)) {
      await releaseRateLimitBucket(dedupKey);
    }
    throw error;
  }
}

export const marketingDemoLeadService = {
  async submit(lead: MarketingDemoRequestInput): Promise<DemoLeadSubmitResult> {
    const fp = fingerprint(lead);
    const existing = inFlightByFingerprint.get(fp);
    if (existing) {
      return existing;
    }

    const promise = submitInternal(lead).finally(() => {
      inFlightByFingerprint.delete(fp);
    });
    inFlightByFingerprint.set(fp, promise);
    return promise;
  },
};