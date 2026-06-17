import { config } from "dotenv";
import { z } from "zod";

config();

const migrationEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  TZ: z.string().min(1).default("America/Argentina/Buenos_Aires"),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().int().positive().default(1433),
  DB_NAME: z.string().min(1),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_ENCRYPT: z.stringbool().default(false),
  DB_TRUST_SERVER_CERTIFICATE: z.stringbool().default(true),
});

const parsed = migrationEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid migration environment variables:");
  console.error(parsed.error.format());
  process.exit(1);
}

export const migrationEnv = parsed.data;
