/**
 * Stable security / audit event codes used across the product.
 *
 * This is an inventory catalog (Phase 4E), not a second logging framework.
 * Prefer these codes in new security-relevant logs and API errors.
 * Do not invent parallel taxonomies.
 */

/** API / middleware failure codes with security relevance. */
export const SECURITY_API_EVENT_CODES = [
  "AUTH_INVALID_TOKEN",
  "AUTH_REVOKED_TOKEN",
  "AUTH_TOKEN_VERSION_MISMATCH",
  "AUTH_REQUIRED",
  "TENANT_ACCESS_DENIED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "RATE_LIMIT_STORE_UNAVAILABLE",
  "TWILIO_SIGNATURE_INVALID",
  "TWILIO_SIGNATURE_CONFIG_MISSING",
  "INVITATION_INVALID",
  "INVITATION_EXPIRED",
  "VALIDATION_ERROR",
  "INTERNAL_SERVER_ERROR",
] as const;

export type SecurityApiEventCode = (typeof SECURITY_API_EVENT_CODES)[number] | (string & {});

/** Structured log / console event names for security observability. */
export const SECURITY_LOG_EVENT_CODES = [
  "AUTH_INVALID_TOKEN",
  "AUTH_REVOKED_TOKEN",
  "TENANT_ACCESS_DENIED",
  "TWILIO_SIGNATURE_INVALID",
  "TWILIO_SIGNATURE_CONFIG_MISSING",
  "WEBHOOK_REPLAY_ANOMALY",
  "WEBHOOK_IDEMPOTENT_REPLAY",
  "RATE_LIMIT_STORE_FAILURE",
  "ATTENDANCE_LOCATION_ANOMALY",
  "ATTENDANCE_LEGACY_DERIVED_FIELDS_IGNORED",
  "CONFIG_LOAD_ERROR",
  "DISTRIBUTED_LOCK_FAILURE",
] as const;

export type SecurityLogEventCode = (typeof SECURITY_LOG_EVENT_CODES)[number] | (string & {});
