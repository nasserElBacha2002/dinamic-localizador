import { env } from "../../config/env";

/**
 * Canonical admin UI path for an absence request (matches navigable entity `absence`).
 * Request ids are globally unique; API calls use the active company from session.
 */
export const buildAbsenceRequestAdminUrl = (requestId: string): string =>
  `${env.FRONTEND_URL.replace(/\/$/, "")}/absences/${requestId}`;
