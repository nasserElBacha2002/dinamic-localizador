import { env } from "../../config/env";
import type { AdminAlertTemplateCategory } from "../../constants/admin-alert";

export const resolveAdminAlertContentSid = (
  category: AdminAlertTemplateCategory,
): string | null => {
  switch (category) {
    case "OPERATIONAL":
    case "SECURITY":
      return env.TWILIO_ADMIN_OPERATIONAL_ALERT_CONTENT_SID?.trim() || null;
    case "REQUEST":
      return env.TWILIO_ADMIN_REQUEST_ALERT_CONTENT_SID?.trim() || null;
    default:
      return null;
  }
};
