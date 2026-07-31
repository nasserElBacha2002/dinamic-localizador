import { Readable } from "node:stream";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { absenceAttachmentRepository } from "../repositories/absence-attachment.repository";
import {
  toAbsenceAttachmentDto,
  type AbsenceRequestAttachmentDto,
} from "../types/absence-attachment";
import { assertSafeTwilioMediaUrl } from "../utils/absence-attachments/twilio-media-url";
import { absenceAttachmentService } from "./absence-attachment.service";

export type TwilioMediaItem = {
  url: string;
  contentType: string;
  index: number;
};

export const extractTwilioMediaItems = (
  payload: Record<string, unknown>,
): TwilioMediaItem[] => {
  const numMedia = Number(payload.NumMedia ?? 0);
  if (!Number.isFinite(numMedia) || numMedia <= 0) {
    return [];
  }
  const items: TwilioMediaItem[] = [];
  for (let i = 0; i < numMedia; i += 1) {
    const url = payload[`MediaUrl${i}`];
    if (typeof url !== "string" || !url.trim()) {
      continue;
    }
    const contentType =
      typeof payload[`MediaContentType${i}`] === "string"
        ? String(payload[`MediaContentType${i}`])
        : "application/octet-stream";
    items.push({ url: url.trim(), contentType, index: i });
  }
  return items;
};

const openTwilioMediaStream = async (
  mediaUrl: string,
): Promise<{ stream: Readable; contentType: string | null }> => {
  await assertSafeTwilioMediaUrl(mediaUrl);

  const accountSid = env.TWILIO_ACCOUNT_SID;
  const authToken = env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new AppError(
      503,
      "TWILIO_NOT_CONFIGURED",
      "No se puede descargar media de Twilio: credenciales ausentes",
    );
  }

  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(mediaUrl, {
      headers: { Authorization: `Basic ${auth}` },
      signal: controller.signal,
      // Prevent Authorization header from following redirects to other hosts.
      redirect: "error",
    });
    if (!response.ok || !response.body) {
      throw new AppError(
        502,
        "TWILIO_MEDIA_DOWNLOAD_FAILED",
        `No se pudo descargar el adjunto de WhatsApp (${response.status})`,
      );
    }
    return {
      stream: Readable.fromWeb(response.body as import("stream/web").ReadableStream),
      contentType: response.headers.get("content-type"),
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    if ((error as { name?: string }).name === "AbortError") {
      throw new AppError(504, "TWILIO_MEDIA_TIMEOUT", "Tiempo de espera al descargar media de Twilio");
    }
    throw new AppError(502, "TWILIO_MEDIA_DOWNLOAD_FAILED", "Error al descargar media de Twilio");
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Stream Twilio media end-to-end into GCS (no full-file buffer).
 * Idempotent per (companyId, messageSid, mediaIndex).
 */
export const ingestTwilioMediaAsAbsenceAttachments = async (input: {
  companyId: string;
  requestId: string;
  employeeId: string;
  messageSid: string;
  mediaItems: TwilioMediaItem[];
}): Promise<AbsenceRequestAttachmentDto[]> => {
  const results: AbsenceRequestAttachmentDto[] = [];

  for (const item of input.mediaItems) {
    const existing = await absenceAttachmentRepository.findByTwilioMedia(
      input.companyId,
      input.messageSid,
      item.index,
    );
    if (existing) {
      results.push(toAbsenceAttachmentDto(existing));
      continue;
    }

    const { stream, contentType } = await openTwilioMediaStream(item.url);
    const uploaded = await absenceAttachmentService.uploadFromStream({
      companyId: input.companyId,
      requestId: input.requestId,
      body: stream,
      originalFileName: `whatsapp-media-${item.index}`,
      declaredContentType: contentType || item.contentType,
      source: "WHATSAPP",
      uploadedByEmployeeId: input.employeeId,
      twilioMessageSid: input.messageSid,
      twilioMediaIndex: item.index,
    });
    results.push(uploaded);
  }

  return results;
};
