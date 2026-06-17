import { normalizeTwilioFormBody, TwilioFormBodyError } from "./twilio-form-body";

export type TwilioSignatureFailureCode =
  | "TWILIO_SIGNATURE_CONFIG_MISSING"
  | "TWILIO_SIGNATURE_INVALID";

export interface TwilioSignatureValidationConfig {
  validateSignature: boolean;
  authToken?: string;
  webhookUrl?: string;
  nodeEnv: string;
  validateRequestFn: (
    authToken: string,
    twilioHeader: string,
    url: string,
    params: Record<string, string>,
  ) => boolean;
}

export type TwilioSignatureValidationResult =
  | { success: true; params: Record<string, string> }
  | { success: false; code: TwilioSignatureFailureCode; reason: string };

export const getTwilioBodyKeyMetadata = (body: unknown): { bodyKeys: string[]; bodyKeyCount: number } => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { bodyKeys: [], bodyKeyCount: 0 };
  }

  const bodyKeys = Object.keys(body as Record<string, unknown>).sort();
  return { bodyKeys, bodyKeyCount: bodyKeys.length };
};

export const runTwilioSignatureValidation = (
  config: TwilioSignatureValidationConfig,
  input: {
    signature?: string;
    body: unknown;
  },
): TwilioSignatureValidationResult => {
  if (!config.validateSignature) {
    try {
      return { success: true, params: normalizeTwilioFormBody(input.body) };
    } catch (error) {
      const reason = error instanceof TwilioFormBodyError ? error.message : "invalid-body";
      return { success: false, code: "TWILIO_SIGNATURE_INVALID", reason };
    }
  }

  if (!input.signature) {
    return { success: false, code: "TWILIO_SIGNATURE_CONFIG_MISSING", reason: "missing-signature-header" };
  }

  if (!config.authToken) {
    return { success: false, code: "TWILIO_SIGNATURE_CONFIG_MISSING", reason: "missing-auth-token" };
  }

  if (!config.webhookUrl) {
    return { success: false, code: "TWILIO_SIGNATURE_CONFIG_MISSING", reason: "missing-webhook-url" };
  }

  let params: Record<string, string>;
  try {
    params = normalizeTwilioFormBody(input.body);
  } catch (error) {
    const reason = error instanceof TwilioFormBodyError ? error.message : "invalid-body";
    return { success: false, code: "TWILIO_SIGNATURE_INVALID", reason };
  }

  const isValid = config.validateRequestFn(
    config.authToken,
    input.signature,
    config.webhookUrl,
    params,
  );

  if (!isValid) {
    return { success: false, code: "TWILIO_SIGNATURE_INVALID", reason: "signature-mismatch" };
  }

  return { success: true, params };
};
