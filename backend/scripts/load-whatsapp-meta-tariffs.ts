/**
 * Insert versioned Meta tariffs from evidence JSON (no calculation code changes).
 * Does not silently mutate existing historical tariff rows — use --replace with audit reason.
 *
 * Usage:
 *   npx tsx scripts/load-whatsapp-meta-tariffs.ts [path-to-json]
 *   npx tsx scripts/load-whatsapp-meta-tariffs.ts --replace "audit-ticket-id" [path]
 */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sql from "mssql";
import { config } from "dotenv";
import {
  assertEvidenceMatchesCsvExtract,
  parseMetaTariffEvidenceJson,
  validateMetaTariffEvidence,
  type MetaTariffEvidenceFile,
} from "../src/utils/whatsapp/whatsapp-meta-tariff-evidence";

config();

const moduleDir = dirname(fileURLToPath(import.meta.url));

const loadEvidence = (filePath: string): MetaTariffEvidenceFile => {
  const raw = readFileSync(filePath, "utf8");
  const evidence = parseMetaTariffEvidenceJson(raw);
  const csvRel = evidence.officialSource.csvExtractPath;
  if (csvRel) {
    const csvPath = resolve(dirname(filePath), csvRel);
    const csvBody = readFileSync(csvPath, "utf8");
    validateMetaTariffEvidence({ ...evidence, officialSource: { ...evidence.officialSource, csvExtractPath: csvPath } });
    assertEvidenceMatchesCsvExtract(evidence, csvBody);
  } else {
    validateMetaTariffEvidence(evidence);
  }
  return evidence;
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const replaceMode = args[0] === "--replace";
  const auditRef = replaceMode ? args[1] : undefined;
  const pathArg = replaceMode ? args[2] : args[0];

  const defaultPath = resolve(moduleDir, "../src/data/whatsapp-meta-tariff-evidence-ar-2026-10.json");
  const filePath = pathArg ? resolve(pathArg) : defaultPath;
  const evidence = loadEvidence(filePath);

  const sourceReference = `evidence:${filePath};csvSha256=${evidence.officialSource.csvSha256 ?? "n/a"};verifiedAt=${evidence.officialSource.verifiedAt};${evidence.officialSource.documentationUrl}`;

  const pool = await sql.connect({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_HOST ?? "localhost",
    database: process.env.DB_NAME,
    options: { encrypt: false, trustServerCertificate: true },
  });

  const effectiveFrom = new Date(evidence.effectiveFrom);

  for (const rate of evidence.rates) {
    const existing = await pool
      .request()
      .input("category", sql.NVarChar(40), rate.category)
      .input("country", sql.NVarChar(40), evidence.countryOrRegion)
      .input("effectiveFrom", sql.DateTime2, effectiveFrom)
      .input("currency", sql.Char(3), rate.currency)
      .query(`
        SELECT TOP (1) id, amount
        FROM dbo.whatsapp_message_cost_tariffs
        WHERE category = @category
          AND country_or_region = @country
          AND effective_from = @effectiveFrom
          AND currency = @currency;
      `);

    const row = existing.recordset[0] as { id: string; amount: unknown } | undefined;
    if (!row) {
      await pool
        .request()
        .input("category", sql.NVarChar(40), rate.category)
        .input("currency", sql.Char(3), rate.currency)
        .input("amount", sql.Decimal(18, 6), rate.amount)
        .input("country", sql.NVarChar(40), evidence.countryOrRegion)
        .input("effectiveFrom", sql.DateTime2, effectiveFrom)
        .input("sourceReference", sql.NVarChar(200), sourceReference.slice(0, 200))
        .query(`
          INSERT INTO dbo.whatsapp_message_cost_tariffs (
            category, currency, amount, country_or_region, source_reference, effective_from
          )
          VALUES (@category, @currency, @amount, @country, @sourceReference, @effectiveFrom);
        `);
      continue;
    }

    const current = String(row.amount);
    if (current === rate.amount || Number(current) === Number(rate.amount)) {
      continue;
    }

    if (!replaceMode) {
      throw new Error(
        `Refusing silent change for ${rate.category} ${evidence.countryOrRegion} @ ${evidence.effectiveFrom}: ` +
          `DB=${current} evidence=${rate.amount}. Use --replace <audit-ref> for authorized correction.`,
      );
    }

    await pool
      .request()
      .input("id", sql.UniqueIdentifier, row.id)
      .input("amount", sql.Decimal(18, 6), rate.amount)
      .input("sourceReference", sql.NVarChar(200), `${sourceReference};replace=${auditRef}`.slice(0, 200))
      .query(`
        UPDATE dbo.whatsapp_message_cost_tariffs
        SET amount = @amount,
            source_reference = @sourceReference
        WHERE id = @id;
      `);
  }

  await pool.close();
  console.info("[load-whatsapp-meta-tariffs] applied", evidence.rates.length, "rates for", evidence.countryOrRegion);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});