export interface OperationalLocationDuplicateCliArgs {
  companyId?: string;
  apply: boolean;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const parseOperationalLocationDuplicateCliArgs = (
  argv: string[],
): OperationalLocationDuplicateCliArgs => {
  const args = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      args.set("apply", true);
      continue;
    }
    if (token === "--preview") {
      args.set("apply", false);
      continue;
    }
    if (token.startsWith("--") && argv[index + 1]) {
      args.set(token.slice(2), argv[index + 1]!);
      index += 1;
    }
  }

  const companyId = args.get("company-id") ? String(args.get("company-id")) : undefined;
  if (companyId && !UUID_PATTERN.test(companyId)) {
    throw new Error("company-id inválido (UUID requerido)");
  }

  return {
    companyId,
    apply: args.get("apply") === true,
  };
};

export const printOperationalLocationDuplicateUsage = (): void => {
  console.log(`Usage:
  npm run diagnose:operational-location-duplicates -- [--company-id <uuid>]
  npm run repair:operational-location-duplicates -- [--company-id <uuid>] [--preview|--apply]

Options:
  --company-id <uuid>  Limit audit/repair to one company
  --preview            Show duplicate groups without writing (default for repair)
  --apply              Rename duplicate locations deterministically
`);
};
