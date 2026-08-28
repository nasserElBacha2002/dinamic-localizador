#!/usr/bin/env tsx
import { config } from "dotenv";

config();

const dryRun = process.argv.includes("--dry-run") || process.env.WHATSAPP_RETENTION_DRY_RUN === "true";

async function main(): Promise<void> {
  if (dryRun) {
    process.env.WHATSAPP_RETENTION_DRY_RUN = "true";
  }

  const { connectDatabase, closeDatabase } = await import("../database/connection");
  const { whatsappRetentionService } = await import("../services/whatsapp-retention.service");

  await connectDatabase();
  try {
    const result = await whatsappRetentionService.runCleanup({ dryRun });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeDatabase();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
