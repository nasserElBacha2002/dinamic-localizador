import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { META_TARIFF_CATEGORIES, type MetaBillingCategory } from "../../constants/whatsapp-message-cost";

export interface MetaTariffEvidenceRate {
  category: string;
  metaBillingCategory?: MetaBillingCategory;
  amount: string;
  currency: string;
}

export interface MetaTariffEvidenceFile {
  schemaVersion: number;
  countryOrRegion: string;
  rateCardCurrency: string;
  effectiveFrom: string;
  officialSource: {
    documentationUrl: string;
    rateCardArtifact: string;
    verifiedAt: string;
    csvExtractPath?: string;
    csvSha256?: string;
  };
  rates: MetaTariffEvidenceRate[];
}

const expectedCategories = new Set<string>(Object.values(META_TARIFF_CATEGORIES));

export const parseMetaTariffEvidenceJson = (raw: string): MetaTariffEvidenceFile => {
  const parsed = JSON.parse(raw) as MetaTariffEvidenceFile;
  if (parsed.schemaVersion !== 1) {
    throw new Error(`Unsupported evidence schemaVersion: ${parsed.schemaVersion}`);
  }
  if (!parsed.countryOrRegion?.trim()) {
    throw new Error("Evidence missing countryOrRegion");
  }
  if (!parsed.effectiveFrom?.trim()) {
    throw new Error("Evidence missing effectiveFrom");
  }
  if (!Array.isArray(parsed.rates) || parsed.rates.length === 0) {
    throw new Error("Evidence missing rates");
  }
  return parsed;
};

export const validateMetaTariffEvidence = (evidence: MetaTariffEvidenceFile): void => {
  const effectiveFrom = new Date(evidence.effectiveFrom);
  if (Number.isNaN(effectiveFrom.getTime())) {
    throw new Error(`Invalid effectiveFrom: ${evidence.effectiveFrom}`);
  }

  for (const rate of evidence.rates) {
    if (!expectedCategories.has(rate.category)) {
      throw new Error(`Unknown tariff category in evidence: ${rate.category}`);
    }
    if (rate.currency !== evidence.rateCardCurrency) {
      throw new Error(
        `Currency mismatch for ${rate.category}: ${rate.currency} vs ${evidence.rateCardCurrency}`,
      );
    }
    if (!/^\d+(\.\d+)?$/.test(rate.amount)) {
      throw new Error(`Invalid amount for ${rate.category}: ${rate.amount}`);
    }
  }

  const csvPath = evidence.officialSource.csvExtractPath;
  const csvSha256 = evidence.officialSource.csvSha256;
  if (csvPath && csvSha256) {
    const csvBody = readFileSync(csvPath, "utf8");
    const digest = createHash("sha256").update(csvBody, "utf8").digest("hex");
    if (digest !== csvSha256.toLowerCase()) {
      throw new Error(
        `CSV extract SHA-256 mismatch (expected ${csvSha256}, got ${digest})`,
      );
    }
  }
};

/** Parse Meta USD list CSV extract (Country,Marketing,Utility,Authentication,Service). */
export const parseMetaUsdListRatesCsvExtract = (
  csvBody: string,
): { country: string; marketing: string; utility: string; authentication: string; service: string } | null => {
  const lines = csvBody
    .trim()
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) {
    return null;
  }
  const header = lines[0]!.toLowerCase();
  if (!header.includes("country") || !header.includes("marketing")) {
    return null;
  }
  const argentina = lines.find((l) => /^argentina\s*,/i.test(l) || /^ar\s*,/i.test(l));
  if (!argentina) {
    return null;
  }
  const cols = argentina.split(",").map((c) => c.trim());
  if (cols.length < 5) {
    return null;
  }
  const normalize = (v: string) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(6).replace(/0+$/, "").replace(/\.$/, "") : v;
  };
  return {
    country: cols[0]!,
    marketing: normalize(cols[1]!),
    utility: normalize(cols[2]!),
    authentication: normalize(cols[3]!),
    service: normalize(cols[4]!),
  };
};

export const assertEvidenceMatchesCsvExtract = (
  evidence: MetaTariffEvidenceFile,
  csvBody: string,
): void => {
  const row = parseMetaUsdListRatesCsvExtract(csvBody);
  if (!row) {
    throw new Error("Could not parse Argentina row from CSV extract");
  }
  const byCategory: Record<string, string> = {};
  for (const rate of evidence.rates) {
    byCategory[rate.category] = Number(rate.amount).toFixed(6).replace(/\.?0+$/, "");
  }
  const compare = (cat: string, csvAmount: string) => {
    const evidenceAmount = evidence.rates.find((r) => r.category === cat)?.amount;
    if (!evidenceAmount) {
      throw new Error(`Evidence missing ${cat}`);
    }
    if (Math.abs(Number(evidenceAmount) - Number(csvAmount)) > 0.000001) {
      throw new Error(`Rate mismatch ${cat}: evidence=${evidenceAmount} csv=${csvAmount}`);
    }
  };
  compare("META_MARKETING", row.marketing);
  compare("META_UTILITY", row.utility);
  compare("META_AUTHENTICATION", row.authentication);
  compare("META_SERVICE", row.service);
};