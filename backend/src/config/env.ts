import { config } from "dotenv";
import { z } from "zod";

config();

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
    BOT_SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    BOT_OPERATION_TIMEZONE: z.string().default("America/Argentina/Buenos_Aires"),
    BOT_DEFAULT_RADIUS_METERS: z.coerce.number().int().positive().default(150),
    BOT_GEOFENCE_REVIEW_MARGIN_METERS: z.coerce.number().int().nonnegative().default(30),
    BOT_ON_TIME_GRACE_MINUTES: z.coerce.number().int().nonnegative().default(15),
    JWT_SECRET: z.string().min(16),
    JWT_EXPIRES_IN: z.string().default("8h"),
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

    if (data.NODE_ENV === "production" && !data.TWILIO_WHATSAPP_NUMBER) {
      ctx.addIssue({
        code: "custom",
        message: "TWILIO_WHATSAPP_NUMBER is required in production",
        path: ["TWILIO_WHATSAPP_NUMBER"],
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

export const env = {
  ...parsed.data,
  corsOrigins: parseCorsOrigins(
    parsed.data.NODE_ENV,
    parsed.data.FRONTEND_URL,
    parsed.data.CORS_ALLOWED_ORIGINS,
  ),
  TWILIO_VALIDATE_SIGNATURE:
    parsed.data.TWILIO_VALIDATE_SIGNATURE ?? parsed.data.NODE_ENV === "production",
};
