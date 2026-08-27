/**
 * CLI argument parsing for location-zones:audit (READ-ONLY).
 * Exported for unit tests — no DB access.
 */

export type LocationZonesAuditCliOptions = {
  companyId?: string;
  json: boolean;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value: string): boolean => UUID_RE.test(value.trim());

export const printLocationZonesAuditUsage = (): void => {
  console.log(`Usage:
  npm run location-zones:audit
  npm run location-zones:audit -- --json
  npm run location-zones:audit -- --company-id <uuid>
  npm run location-zones:audit -- --help

Options:
  --json              Print machine-readable summary
  --company-id <uuid> Limit to one company (UUID required)
  --help, -h          Show this help

READ-ONLY: never updates location_zones or calls Google.
`);
};

/**
 * Parse argv. Throws on malformed --company-id (missing value or non-UUID)
 * so the process does not accidentally audit all companies.
 */
export const parseLocationZonesAuditCliArgs = (
  argv: string[],
): LocationZonesAuditCliOptions => {
  const options: LocationZonesAuditCliOptions = { json: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--json") {
      options.json = true;
      continue;
    }
    if (arg === "--company-id") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("Missing value for --company-id <uuid>. See --help.");
      }
      if (!isUuid(value)) {
        throw new Error(`Invalid --company-id UUID: ${value}`);
      }
      options.companyId = value.trim();
      i += 1;
      continue;
    }
    if (arg.startsWith("--company-id=")) {
      const value = arg.slice("--company-id=".length);
      if (!value) {
        throw new Error("Missing value for --company-id=<uuid>. See --help.");
      }
      if (!isUuid(value)) {
        throw new Error(`Invalid --company-id UUID: ${value}`);
      }
      options.companyId = value.trim();
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      continue;
    }
    throw new Error(`Unknown argument: ${arg}. See --help.`);
  }

  return options;
};
