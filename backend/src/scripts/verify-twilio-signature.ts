import twilio from "twilio";
import { normalizeTwilioFormBody } from "../utils/twilio-form-body";
import { runTwilioSignatureValidation } from "../utils/twilio-webhook-signature";

const readArg = (name: string): string | undefined => {
  const prefix = `--${name}=`;
  const inlineArg = process.argv.find((arg) => arg.startsWith(prefix));
  if (inlineArg) {
    return inlineArg.slice(prefix.length);
  }

  return process.env[name.toUpperCase()] ?? process.env[name];
};

const parseParams = (rawParams: string | undefined): Record<string, string> => {
  if (!rawParams) {
    throw new Error("Missing parameters. Use --params='key=value&key2=value2' or PARAMS env var.");
  }

  const searchParams = new URLSearchParams(rawParams);
  const params: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    params[key] = value;
  }

  return params;
};

const main = (): void => {
  const url = readArg("url");
  const signature = readArg("signature");
  const paramsRaw = readArg("params");
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (!url || !signature || !authToken) {
    console.error("Usage: TWILIO_AUTH_TOKEN=*** npm run twilio:signature:verify -- --url=URL --signature=SIGNATURE --params='key=value'");
    process.exit(1);
  }

  const params = parseParams(paramsRaw);
  const normalized = normalizeTwilioFormBody(params);
  const result = runTwilioSignatureValidation(
    {
      validateSignature: true,
      authToken,
      webhookUrl: url,
      nodeEnv: "development",
      validateRequestFn: twilio.validateRequest,
    },
    {
      signature,
      body: normalized,
    },
  );

  if (!result.success) {
    console.error("Signature validation failed:", result.code, result.reason);
    process.exit(2);
  }

  const expected = twilio.getExpectedTwilioSignature(authToken, url, normalized);
  console.info("Signature validation succeeded.");
  console.info(
    JSON.stringify(
      {
        webhookUrl: url,
        bodyKeyCount: Object.keys(normalized).length,
        bodyKeys: Object.keys(normalized).sort(),
        signatureMatchesExpected: signature === expected,
      },
      null,
      2,
    ),
  );
};

main();
