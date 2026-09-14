import twilio from "twilio";
import { whatsappMessageRepository } from "../../repositories/whatsapp-message.repository";
import {
  getObservabilityTrace,
  setObservabilityFlowResult,
} from "../../utils/whatsapp-observability-scope";
import {
  isSimulationActive,
  setLastBotResponse,
} from "../../utils/bot-runtime-context";
import { runOutboundPersistAfterCommitHookForTests } from "../../utils/checkout-transaction-hooks";
import { setRoutingResult } from "../../utils/whatsapp-routing-result";
import { getQuotaTurnScope } from "../../utils/whatsapp-quota-turn-scope";
import { whatsappUsageQuotaService } from "../whatsapp-usage-quota.service";
import { whatsappFlowTraceService } from "../whatsapp-flow-trace.service";

export const buildTwiml = (message: string): string => {
  const response = new twilio.twiml.MessagingResponse();
  // Empty body → empty <Response/> (no WhatsApp text bubble). Used when media
  // was already sent out-of-band (e.g. payroll PDF documents).
  if (message.trim().length > 0) {
    response.message(message);
  }
  return response.toString();
};

export const saveOutboundMessage = async (
  companyId: string,
  input: {
    employeeId: string | null;
    phoneFrom: string;
    phoneTo: string;
    body: string;
  },
): Promise<void> => {
  if (!input.body.trim()) {
    setLastBotResponse(input.body);
    return;
  }

  if (isSimulationActive()) {
    setLastBotResponse(input.body);
    return;
  }

  await runOutboundPersistAfterCommitHookForTests();

  const outbound = await whatsappMessageRepository.create({
    companyId,
    messageSid: null,
    direction: "OUTBOUND",
    employeeId: input.employeeId,
    phoneFrom: input.phoneFrom,
    phoneTo: input.phoneTo,
    messageType: "TEXT",
    body: input.body,
    latitude: null,
    longitude: null,
    status: "SENT",
    rawPayload: null,
  });

  const trace = getObservabilityTrace();
  if (trace && outbound?.id) {
    await whatsappFlowTraceService.linkMessageObservability({
      messageId: outbound.id,
      conversationId: trace.conversationId,
      correlationId: trace.correlationId,
      causationId: trace.executionId,
      provider: "TWILIO",
      providerStatus: "sent",
    });
    await trace.addStep({
      stepType: "MESSAGE_BUILD",
      status: "SUCCESS",
      output: { outboundMessageId: outbound.id, bodyPreview: input.body.slice(0, 120) },
    });
  }
};

export const respond = async (
  companyId: string,
  input: {
    message: string;
    employeeId: string | null;
    phoneFrom: string;
    phoneTo: string;
    resultCode?: string;
    flowType?: string;
  },
): Promise<string> => {
  setLastBotResponse(input.message);
  // Always record routing outcome (independent of observability ALS).
  if (input.resultCode || input.flowType) {
    setRoutingResult({
      resultCode: input.resultCode ?? null,
      flowType: input.flowType ?? null,
    });
    setObservabilityFlowResult({
      resultCode: input.resultCode,
      flowType: input.flowType,
      relatedEntities: { employeeId: input.employeeId },
    });
  }

  const quotaScope = getQuotaTurnScope();
  let reservationId: string | null = null;
  if (
    quotaScope &&
    (quotaScope.enforceOutbounds || quotaScope.shadowOutbounds) &&
    input.employeeId &&
    input.message.trim().length > 0
  ) {
    const logicalKey = `${quotaScope.messageSid}:twiml:0`;
    const reserved = await whatsappUsageQuotaService.reserveOutbound({
      companyId,
      employeeId: input.employeeId,
      turnMessageSid: quotaScope.messageSid,
      logicalOutboundKey: logicalKey,
      policy: quotaScope.policySnapshot,
    });
    if (!reserved.ok) {
      if (quotaScope.shadowOutbounds && !quotaScope.enforceOutbounds) {
        // SHADOW must never block TwiML.
      } else {
        // No budget for this non-critical TwiML unit — silent empty ACK (ENFORCE).
        return buildTwiml("");
      }
    }
    reservationId =
      reserved.ok && !reserved.reservationId.startsWith("noop")
        ? reserved.reservationId
        : null;
    if (reservationId && quotaScope.enforceOutbounds) {
      await whatsappUsageQuotaService.markOutboundAttemptStarted(reservationId);
    }
  }

  await saveOutboundMessage(companyId, {
    employeeId: input.employeeId,
    phoneFrom: input.phoneFrom,
    phoneTo: input.phoneTo,
    body: input.message,
  });

  if (reservationId && quotaScope?.enforceOutbounds) {
    // TwiML XML about to be returned — RESPONSE_BUILT, not provider ACCEPTED.
    await whatsappUsageQuotaService.markOutboundResponseBuilt(reservationId);
  }

  return buildTwiml(input.message);
};
