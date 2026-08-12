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
  if (input.resultCode || input.flowType) {
    setObservabilityFlowResult({
      resultCode: input.resultCode,
      flowType: input.flowType,
      relatedEntities: { employeeId: input.employeeId },
    });
  }

  await saveOutboundMessage(companyId, {
    employeeId: input.employeeId,
    phoneFrom: input.phoneFrom,
    phoneTo: input.phoneTo,
    body: input.message,
  });

  return buildTwiml(input.message);
};
