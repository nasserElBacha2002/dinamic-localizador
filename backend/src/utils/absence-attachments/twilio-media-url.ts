import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { AppError } from "../../errors/app-error";

const TWILIO_MEDIA_HOST_SUFFIXES = [
  ".twilio.com",
  ".twiliousercontent.com",
  "api.twilio.com",
];

const isPrivateOrLoopbackIp = (ip: string): boolean => {
  if (ip === "127.0.0.1" || ip === "::1" || ip === "0.0.0.0") {
    return true;
  }
  if (ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.")) {
    return true;
  }
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) {
    return true;
  }
  if (ip.toLowerCase().startsWith("fc") || ip.toLowerCase().startsWith("fd") || ip.toLowerCase().startsWith("fe80")) {
    return true;
  }
  return false;
};

const isAllowedTwilioHost = (hostname: string): boolean => {
  const host = hostname.toLowerCase();
  return TWILIO_MEDIA_HOST_SUFFIXES.some(
    (suffix) => host === suffix.replace(/^\./, "") || host.endsWith(suffix),
  );
};

export const assertSafeTwilioMediaUrl = async (rawUrl: string): Promise<URL> => {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new AppError(400, "TWILIO_MEDIA_URL_INVALID", "URL de media de Twilio inválida");
  }

  if (url.protocol !== "https:") {
    throw new AppError(400, "TWILIO_MEDIA_URL_INSECURE", "La URL de media debe usar HTTPS");
  }

  if (!isAllowedTwilioHost(url.hostname)) {
    throw new AppError(
      400,
      "TWILIO_MEDIA_HOST_FORBIDDEN",
      "Host de media de Twilio no permitido",
    );
  }

  const hostname = url.hostname;
  if (isIP(hostname)) {
    if (isPrivateOrLoopbackIp(hostname)) {
      throw new AppError(400, "TWILIO_MEDIA_SSRF_BLOCKED", "IP de media bloqueada");
    }
  } else {
    const records = await lookup(hostname, { all: true, verbatim: true });
    for (const record of records) {
      if (isPrivateOrLoopbackIp(record.address)) {
        throw new AppError(
          400,
          "TWILIO_MEDIA_SSRF_BLOCKED",
          "Resolución DNS de media bloqueada (SSRF)",
        );
      }
    }
  }

  return url;
};
