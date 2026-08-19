import { requireContentSidWhenWorkerEnabled } from "./notification-worker-env-rules";
import { config } from "dotenv";
import { z } from "zod";
import { resolveGoogleApplicationCredentialsPath } from "./resolve-gcp-credentials";

config();
resolveGoogleApplicationCredentialsPath();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    FRONTEND_URL: z.string().url(),
    APP_BASE_URL: z.string().url().optional(),
    CORS_ALLOWED_ORIGINS: z.string().optional(),
    TZ: z.string().min(1),
    DB_HOST: z.string().min(1),
    DB_PORT: z.coerce.number().int().positive().default(1433),
    DB_NAME: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_PASSWORD: z.string().min(1),
    DB_ENCRYPT: z.stringbool().default(false),
    DB_TRUST_SERVER_CERTIFICATE: z.stringbool().default(true),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_WHATSAPP_NUMBER: z.string().optional(),
    TWILIO_WEBHOOK_URL: z.string().url().optional(),
    TWILIO_VALIDATE_SIGNATURE: z.stringbool().optional(),
    TWILIO_ARRIVAL_REMINDER_CONTENT_SID: z.string().optional(),
    TWILIO_EXIT_REMINDER_CONTENT_SID: z.string().optional(),
    TWILIO_ATTENDANCE_CONFIRMATION_CONTENT_SID: z.string().optional(),
    TWILIO_TEMPLATE_NO_CHECKIN_SID: z.string().optional(),
    TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID: z.string().optional(),
    TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID: z.string().optional(),
    ATTENDANCE_REMINDER_JOB_ENABLED: z.stringbool().default(true),
    RECURRING_WORKDAY_HORIZON_DAYS: z.coerce.number().int().positive().default(60),
    RECURRING_WORKDAY_MATERIALIZATION_JOB_ENABLED: z.stringbool().default(true),
    BOT_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    BOT_OPERATION_TIMEZONE: z.string().default("America/Argentina/Buenos_Aires"),
    BOT_DEFAULT_RADIUS_METERS: z.coerce.number().int().positive().default(150),
    BOT_GEOFENCE_REVIEW_MARGIN_METERS: z.coerce.number().int().nonnegative().default(30),
    BOT_ON_TIME_GRACE_MINUTES: z.coerce.number().int().nonnegative().default(15),
    BOT_CHECKOUT_EARLY_TOLERANCE_MINUTES: z.coerce.number().int().nonnegative().default(15),
    BOT_DEFAULT_COMPANY_ID: z.string().uuid().optional(),
    BOT_DEFAULT_COMPANY_NAME: z.string().min(1).optional(),
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRES_IN: z.string().default("8h"),
    TWO_FACTOR_ISSUER: z.string().min(1).default("Dinamic Attendance"),
    TWO_FACTOR_ENCRYPTION_KEY: z.string().optional(),
    TWO_FACTOR_CHALLENGE_SECRET: z.string().min(16).optional(),
    TWO_FACTOR_CHALLENGE_TTL_MINUTES: z.coerce.number().int().positive().default(5),
    /** In-memory, per process. Also applied to 2FA confirm / disable / recovery regenerate. */
    TWO_FACTOR_LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
    TWO_FACTOR_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(8),
    INVITATION_TTL_HOURS: z.coerce.number().int().positive().default(72),
    PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(60),
    AUTH_LOGIN_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
    AUTH_LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
    PASSWORD_RESET_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
    /** Floor for forgot-password duration (timing mitigation, not constant-time). */
    PASSWORD_RESET_MIN_DURATION_MS: z.coerce.number().int().nonnegative().default(300),
    PASSWORD_RESET_DURATION_JITTER_MS: z.coerce.number().int().nonnegative().default(150),
    /**
     * Explicit email transport. When omitted:
     * - smtp if SMTP_HOST is set
     * - console in development/test
     * - smtp required in production (validated below)
     */
    EMAIL_TRANSPORT: z.enum(["smtp", "console", "disabled"]).optional(),
    SMTP_HOST: z.string().min(1).optional(),
    SMTP_PORT: z.coerce.number().int().positive().default(587),
    SMTP_SECURE: z.stringbool().default(false),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SMTP_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    SMTP_SOCKET_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
    /** Google Cloud Storage — absence attachments (optional until feature enabled). */
    GCS_PROJECT_ID: z.string().min(1).optional(),
    GCS_BUCKET_NAME: z.string().min(1).optional(),
    GCS_STORAGE_PREFIX: z.string().min(1).default("absence-attachments"),
    GCS_SIGNED_URL_EXPIRATION_SECONDS: z.coerce.number().int().positive().default(300),
    GCS_MAX_FILE_SIZE_BYTES: z.coerce.number().int().positive().default(5_242_880),
    GCS_MAX_FILES_PER_REQUEST: z.coerce.number().int().positive().default(5),
    GCS_MAX_TOTAL_SIZE_BYTES: z.coerce.number().int().positive().default(15_728_640),
    GCS_UPLOAD_MODE: z.enum(["BACKEND_STREAM"]).default("BACKEND_STREAM"),
    /** When true, missing/unavailable GCS makes platform diagnostics overall status non-ok. */
    GCS_REQUIRED: z.stringbool().default(false),
    PLATFORM_SERVER_STATUS_CHECK_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
    API_SERVICE_NAME: z.string().min(1).default("dinamic-attendance-api"),
    ABSENCE_ATTACHMENT_CLEANUP_JOB_ENABLED: z.stringbool().default(true),
    ABSENCE_ATTACHMENT_PENDING_TTL_MINUTES: z.coerce.number().int().positive().default(60),
    /** Google Cloud Storage prefix for payroll receipts (same bucket as absences). */
    PAYROLL_RECEIPTS_STORAGE_PREFIX: z.string().min(1).default("payroll-receipts"),
    PAYROLL_RECEIPTS_MAX_FILES_PER_BATCH: z.coerce.number().int().positive().default(50),
    PAYROLL_RECEIPT_NOTIFICATION_WORKER_ENABLED: z.stringbool().default(true),
    PAYROLL_RECEIPT_NOTIFICATION_WORKER_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
    PAYROLL_RECEIPT_NOTIFICATION_LEASE_MS: z.coerce.number().int().positive().default(120_000),
    PAYROLL_RECEIPT_NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    PAYROLL_RECEIPT_NOTIFICATION_RETRY_BASE_MS: z.coerce.number().int().positive().default(30_000),
    /** ONE_TIME assignment WhatsApp outbox worker (default off until Content SID is configured). */
    OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_ENABLED: z.stringbool().default(false),
    OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60_000),
    OPERATION_ASSIGNMENT_NOTIFICATION_LEASE_MS: z.coerce.number().int().positive().default(120_000),
    OPERATION_ASSIGNMENT_NOTIFICATION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OPERATION_ASSIGNMENT_NOTIFICATION_RETRY_BASE_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30_000),
    PAYROLL_RECEIPT_MEDIA_URL_EXPIRATION_SECONDS: z.coerce.number().int().positive().default(900),
    /** Grace days between company deactivation and scheduled hard delete. */
    COMPANY_DELETION_GRACE_PERIOD_DAYS: z.coerce.number().int().positive().default(30),
    COMPANY_DELETION_JOB_ENABLED: z.stringbool().default(true),
    /** Interval for the company deletion worker (ms). Default: 1 hour. */
    COMPANY_DELETION_JOB_INTERVAL_MS: z.coerce.number().int().positive().default(3_600_000),
    /** ONE_TIME clock status promotions (SCHEDULED/IN_PROGRESS → COMPLETED). */
    OPERATION_LIFECYCLE_JOB_ENABLED: z.stringbool().default(true),
    OPERATION_LIFECYCLE_JOB_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
    OPERATION_LIFECYCLE_JOB_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(100),
    OPERATION_LIFECYCLE_JOB_MAX_BATCHES_PER_TICK: z.coerce.number().int().positive().max(100).default(20),
    /** Lease duration for a deletion claim (ms). Default: 30 minutes. */
    COMPANY_DELETION_LEASE_MS: z.coerce.number().int().positive().default(1_800_000),
    /** Max deletion attempts before requiring manual intervention (still DELETION_FAILED). */
    COMPANY_DELETION_MAX_ATTEMPTS: z.coerce.number().int().positive().default(10),
    /** Base backoff for deletion retries (ms). */
    COMPANY_DELETION_RETRY_BASE_MS: z.coerce.number().int().positive().default(60_000),
    /**
     * Comma-separated company UUIDs that cannot be deactivated/deleted (preferred).
     * Empty = no ID-based protection (names may still apply as legacy fallback).
     */
    COMPANY_PROTECTED_IDS: z.string().default(""),
    /**
     * @deprecated Prefer COMPANY_PROTECTED_IDS. Comma-separated names (mutable).
     */
    COMPANY_PROTECTED_NAMES: z.string().default("Dinamic Systems"),
    WHATSAPP_OBSERVABILITY_ENABLED: z.stringbool().default(true),
    WHATSAPP_OBSERVABILITY_UI_ENABLED: z.stringbool().default(true),
    WHATSAPP_TWILIO_STATUS_CALLBACK_ENABLED: z.stringbool().default(true),
    TWILIO_STATUS_CALLBACK_URL: z.string().url().optional(),
    WHATSAPP_OBSERVABILITY_MESSAGE_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
    WHATSAPP_OBSERVABILITY_FLOW_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
    WHATSAPP_OBSERVABILITY_CANDIDATE_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
    WHATSAPP_OBSERVABILITY_PROVIDER_EVENT_RETENTION_DAYS: z.coerce
      .number()
      .int()
      .positive()
      .default(90),
    WHATSAPP_OBSERVABILITY_CLEANUP_JOB_ENABLED: z.stringbool().default(true),
    WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET: z.string().min(16).optional(),
    /**
     * Retention for template variable JSON only (not full message bodies).
     * Renamed semantically; env key kept for compatibility.
     * Empty string from Compose (`VAR=`) must not coerce to 0.
     */
    WHATSAPP_OBSERVABILITY_TEMPLATE_VARS_RETENTION_DAYS: z.preprocess(
      (value) => (value === "" || value === undefined || value === null ? undefined : value),
      z.coerce.number().int().positive().optional(),
    ),
  })
  .superRefine((data, ctx) => {
    const validateSignature = data.TWILIO_VALIDATE_SIGNATURE ?? data.NODE_ENV === "production";

    if (data.NODE_ENV === "production" && !validateSignature) {
      ctx.addIssue({
        code: "custom",
        message: "TWILIO_VALIDATE_SIGNATURE must be true in production",
        path: ["TWILIO_VALIDATE_SIGNATURE"],
      });
    }

    if (validateSignature && !data.TWILIO_AUTH_TOKEN) {
      ctx.addIssue({
        code: "custom",
        message: "TWILIO_AUTH_TOKEN is required when signature validation is enabled",
        path: ["TWILIO_AUTH_TOKEN"],
      });
    }

    if (validateSignature && !data.TWILIO_WEBHOOK_URL) {
      ctx.addIssue({
        code: "custom",
        message: "TWILIO_WEBHOOK_URL is required when signature validation is enabled",
        path: ["TWILIO_WEBHOOK_URL"],
      });
    }

    if (
      data.NODE_ENV === "production" &&
      data.WHATSAPP_TWILIO_STATUS_CALLBACK_ENABLED &&
      !data.TWILIO_STATUS_CALLBACK_URL
    ) {
      ctx.addIssue({
        code: "custom",
        message:
          "TWILIO_STATUS_CALLBACK_URL is required in production when WhatsApp status callbacks are enabled",
        path: ["TWILIO_STATUS_CALLBACK_URL"],
      });
    }

    if (data.TWILIO_STATUS_CALLBACK_URL) {
      if (data.TWILIO_STATUS_CALLBACK_URL.endsWith("/")) {
        ctx.addIssue({
          code: "custom",
          message: "TWILIO_STATUS_CALLBACK_URL must not end with a trailing slash",
          path: ["TWILIO_STATUS_CALLBACK_URL"],
        });
      }
      if (data.NODE_ENV === "production" && !data.TWILIO_STATUS_CALLBACK_URL.startsWith("https://")) {
        ctx.addIssue({
          code: "custom",
          message: "TWILIO_STATUS_CALLBACK_URL must use HTTPS in production",
          path: ["TWILIO_STATUS_CALLBACK_URL"],
        });
      }
    }

    if (data.NODE_ENV === "production" && data.WHATSAPP_OBSERVABILITY_ENABLED) {
      if (!data.WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET) {
        ctx.addIssue({
          code: "custom",
          message:
            "WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET is required in production when observability is enabled",
          path: ["WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET"],
        });
      }
    }

    if (data.TWILIO_WEBHOOK_URL) {
      if (data.TWILIO_WEBHOOK_URL.endsWith("/")) {
        ctx.addIssue({
          code: "custom",
          message: "TWILIO_WEBHOOK_URL must not end with a trailing slash",
          path: ["TWILIO_WEBHOOK_URL"],
        });
      }

      if (data.NODE_ENV === "production") {
        if (!data.TWILIO_WEBHOOK_URL.startsWith("https://")) {
          ctx.addIssue({
            code: "custom",
            message: "TWILIO_WEBHOOK_URL must use HTTPS in production",
            path: ["TWILIO_WEBHOOK_URL"],
          });
        }

        if (/localhost|127\.0\.0\.1/i.test(data.TWILIO_WEBHOOK_URL)) {
          ctx.addIssue({
            code: "custom",
            message: "TWILIO_WEBHOOK_URL cannot use localhost in production",
            path: ["TWILIO_WEBHOOK_URL"],
          });
        }
      }
    }

    if (data.NODE_ENV === "production" && !data.TWILIO_WHATSAPP_NUMBER) {
      ctx.addIssue({
        code: "custom",
        message: "TWILIO_WHATSAPP_NUMBER is required in production",
        path: ["TWILIO_WHATSAPP_NUMBER"],
      });
    }

    if (data.NODE_ENV === "production" && !data.TWILIO_ACCOUNT_SID) {
      ctx.addIssue({
        code: "custom",
        message: "TWILIO_ACCOUNT_SID is required in production",
        path: ["TWILIO_ACCOUNT_SID"],
      });
    }

    if (data.NODE_ENV === "production" && data.ATTENDANCE_REMINDER_JOB_ENABLED) {
      if (!data.TWILIO_ARRIVAL_REMINDER_CONTENT_SID) {
        ctx.addIssue({
          code: "custom",
          message:
            "TWILIO_ARRIVAL_REMINDER_CONTENT_SID is required in production when attendance reminders are enabled",
          path: ["TWILIO_ARRIVAL_REMINDER_CONTENT_SID"],
        });
      }

      if (!data.TWILIO_EXIT_REMINDER_CONTENT_SID) {
        ctx.addIssue({
          code: "custom",
          message:
            "TWILIO_EXIT_REMINDER_CONTENT_SID is required in production when attendance reminders are enabled",
          path: ["TWILIO_EXIT_REMINDER_CONTENT_SID"],
        });
      }

      if (!data.TWILIO_TEMPLATE_NO_CHECKIN_SID) {
        ctx.addIssue({
          code: "custom",
          message:
            "TWILIO_TEMPLATE_NO_CHECKIN_SID is required in production when attendance reminders are enabled",
          path: ["TWILIO_TEMPLATE_NO_CHECKIN_SID"],
        });
      }
    }

    const payrollSidGate = requireContentSidWhenWorkerEnabled(
      {
        workerEnabled: data.PAYROLL_RECEIPT_NOTIFICATION_WORKER_ENABLED,
        contentSid: data.TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID,
      },
      "TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID",
      "PAYROLL_RECEIPT_NOTIFICATION_WORKER_ENABLED",
    );
    if (!payrollSidGate.ok) {
      ctx.addIssue({
        code: "custom",
        message: payrollSidGate.message,
        path: ["TWILIO_PAYROLL_RECEIPT_AVAILABLE_CONTENT_SID"],
      });
    }

    const assignmentSidGate = requireContentSidWhenWorkerEnabled(
      {
        workerEnabled: data.OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_ENABLED,
        contentSid: data.TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID,
      },
      "TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID",
      "OPERATION_ASSIGNMENT_NOTIFICATION_WORKER_ENABLED",
    );
    if (!assignmentSidGate.ok) {
      ctx.addIssue({
        code: "custom",
        message: assignmentSidGate.message,
        path: ["TWILIO_EVENTUAL_OPERATION_ASSIGNED_CONTENT_SID"],
      });
    }

    const emailTransport =
      data.EMAIL_TRANSPORT ??
      (data.SMTP_HOST ? "smtp" : data.NODE_ENV === "production" ? "smtp" : "console");

    if (emailTransport === "console" && data.NODE_ENV === "production") {
      ctx.addIssue({
        code: "custom",
        message: "EMAIL_TRANSPORT=console is not allowed in production",
        path: ["EMAIL_TRANSPORT"],
      });
    }

    if (emailTransport === "smtp") {
      if (!data.SMTP_HOST) {
        ctx.addIssue({
          code: "custom",
          message: "SMTP_HOST is required when EMAIL_TRANSPORT=smtp",
          path: ["SMTP_HOST"],
        });
      }

      if (!data.SMTP_FROM && !data.SMTP_USER) {
        ctx.addIssue({
          code: "custom",
          message: "SMTP_FROM (or SMTP_USER) is required when EMAIL_TRANSPORT=smtp",
          path: ["SMTP_FROM"],
        });
      }

      const hasUser = Boolean(data.SMTP_USER);
      const hasPassword = Boolean(data.SMTP_PASSWORD);
      if (hasUser !== hasPassword) {
        ctx.addIssue({
          code: "custom",
          message: "SMTP_USER and SMTP_PASSWORD must be set together",
          path: hasUser ? ["SMTP_PASSWORD"] : ["SMTP_USER"],
        });
      }
    }

    if (data.NODE_ENV === "production" && !data.TWO_FACTOR_ENCRYPTION_KEY?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "TWO_FACTOR_ENCRYPTION_KEY is required in production (32-byte key, base64 or hex)",
        path: ["TWO_FACTOR_ENCRYPTION_KEY"],
      });
    }

    if (data.NODE_ENV === "production" && !data.TWO_FACTOR_CHALLENGE_SECRET?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "TWO_FACTOR_CHALLENGE_SECRET is required in production (min 16 chars, distinct from JWT_SECRET)",
        path: ["TWO_FACTOR_CHALLENGE_SECRET"],
      });
    }

    if (
      data.TWO_FACTOR_CHALLENGE_SECRET &&
      data.TWO_FACTOR_CHALLENGE_SECRET === data.JWT_SECRET
    ) {
      ctx.addIssue({
        code: "custom",
        message: "TWO_FACTOR_CHALLENGE_SECRET must not equal JWT_SECRET",
        path: ["TWO_FACTOR_CHALLENGE_SECRET"],
      });
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:");
  console.error(parsed.error.format());
  process.exit(1);
}

const parseCorsOrigins = (
  nodeEnv: "development" | "test" | "production",
  frontendUrl: string,
  corsAllowedOrigins?: string,
): string[] => {
  const origins = new Set<string>();

  if (nodeEnv === "production") {
    if (corsAllowedOrigins) {
      for (const origin of corsAllowedOrigins.split(",")) {
        const trimmed = origin.trim();
        if (trimmed.length > 0) {
          origins.add(trimmed);
        }
      }
    } else {
      origins.add(frontendUrl);
    }
  } else {
    origins.add(frontendUrl);

    if (corsAllowedOrigins) {
      for (const origin of corsAllowedOrigins.split(",")) {
        const trimmed = origin.trim();
        if (trimmed.length > 0) {
          origins.add(trimmed);
        }
      }
    }
  }

  return Array.from(origins);
};

const DEV_TWO_FACTOR_AES_KEY = Buffer.alloc(32, 7);

const parseTwoFactorEncryptionKey = (raw: string | undefined, nodeEnv: string): Buffer => {
  if (!raw?.trim()) {
    if (nodeEnv === "production") {
      throw new Error("TWO_FACTOR_ENCRYPTION_KEY is required in production");
    }
    return DEV_TWO_FACTOR_AES_KEY;
  }
  const trimmed = raw.trim();
  const asBase64 = Buffer.from(trimmed, "base64");
  if (asBase64.length === 32) {
    return asBase64;
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  console.error("TWO_FACTOR_ENCRYPTION_KEY must be 32 bytes (base64) or 64 hex characters");
  process.exit(1);
};

const resolvedEmailTransport =
  parsed.data.EMAIL_TRANSPORT ??
  (parsed.data.SMTP_HOST
    ? "smtp"
    : parsed.data.NODE_ENV === "production"
      ? "smtp"
      : "console");

export const env = {
  ...parsed.data,
  EMAIL_TRANSPORT: resolvedEmailTransport as "smtp" | "console" | "disabled",
  TWO_FACTOR_ENCRYPTION_KEY: parseTwoFactorEncryptionKey(
    parsed.data.TWO_FACTOR_ENCRYPTION_KEY,
    parsed.data.NODE_ENV,
  ),
  TWO_FACTOR_CHALLENGE_SECRET:
    parsed.data.TWO_FACTOR_CHALLENGE_SECRET ??
    (parsed.data.NODE_ENV === "production"
      ? parsed.data.JWT_SECRET
      : "dev-only-2fa-challenge-secret"),
  corsOrigins: parseCorsOrigins(
    parsed.data.NODE_ENV,
    parsed.data.FRONTEND_URL,
    parsed.data.CORS_ALLOWED_ORIGINS,
  ),
  TWILIO_VALIDATE_SIGNATURE:
    parsed.data.TWILIO_VALIDATE_SIGNATURE ?? parsed.data.NODE_ENV === "production",
  WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET:
    parsed.data.WHATSAPP_OBSERVABILITY_PHONE_HASH_SECRET ??
    // Non-production fallback keeps local/dev working; production requires explicit secret.
    `dev-only-${parsed.data.JWT_SECRET.slice(0, 24)}`,
  WHATSAPP_OBSERVABILITY_TEMPLATE_VARS_RETENTION_DAYS:
    parsed.data.WHATSAPP_OBSERVABILITY_TEMPLATE_VARS_RETENTION_DAYS ??
    parsed.data.WHATSAPP_OBSERVABILITY_MESSAGE_RETENTION_DAYS,
};
