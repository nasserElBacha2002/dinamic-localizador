import type {
  UpdateWhatsAppQuotaSettingsInput,
  WhatsAppQuotaSettings,
} from "../types/whatsapp-quota-settings";
import { scopedApiClient } from "./scoped-client";

export async function getWhatsAppQuotaSettings(): Promise<WhatsAppQuotaSettings> {
  const { data } = await scopedApiClient.get<{ data: WhatsAppQuotaSettings }>(
    "settings/whatsapp-quotas",
  );
  return data.data;
}

export async function updateWhatsAppQuotaSettings(
  input: UpdateWhatsAppQuotaSettingsInput,
): Promise<WhatsAppQuotaSettings> {
  const { data } = await scopedApiClient.patch<{ data: WhatsAppQuotaSettings }>(
    "settings/whatsapp-quotas",
    input,
  );
  return data.data;
}
