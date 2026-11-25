import { z } from "zod";
import { COMMERCIAL_SEAT_QUOTA_MODES } from "../constants/commercial-seat-quota";

export const updateCommercialSeatQuotaSettingsSchema = z.object({
  companyMode: z.enum(COMMERCIAL_SEAT_QUOTA_MODES).nullable(),
});

export type UpdateCommercialSeatQuotaSettingsInput = z.infer<
  typeof updateCommercialSeatQuotaSettingsSchema
>;