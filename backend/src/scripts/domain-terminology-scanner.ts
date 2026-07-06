export type ViolationCategory =
  | "CONTENT_IDENTIFIER"
  | "CONTENT_COPY"
  | "PATH_NAME"
  | "CONFIGURATION";

export interface TerminologyViolation {
  file: string;
  line: number;
  matchedToken: string;
  category: ViolationCategory;
  text: string;
}

export const INVENTORY_ROOTS = [
  "inventory",
  "inventories",
  "inventario",
  "inventarios",
] as const;

export const STORE_ROOTS = ["store", "stores", "tienda", "tiendas"] as const;

const IDENTIFIER_PATTERN = /\b[A-Za-z_][A-Za-z0-9_]*\b/g;
const COPY_PATTERN =
  /\b(inventory|inventories|inventario|inventarios|store|stores|tienda|tiendas)\b/gi;
const CONFIG_SCRIPT_PATTERN =
  /(?:^|["\s:])(?:[^:]+:)?(inventory|inventories|inventario|inventarios|store|stores|tienda|tiendas)(?:$|["\s:,])/gi;

export function splitIdentifierSegments(identifier: string): string[] {
  if (identifier.includes("_")) {
    return identifier.split("_").filter(Boolean);
  }

  const spaced = identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");

  return spaced.split(/\s+/).filter(Boolean);
}

export function matchInventoryInSegment(segment: string): string | null {
  const lower = segment.toLowerCase();
  for (const root of INVENTORY_ROOTS) {
    if (lower === root || lower.startsWith(root)) {
      return root;
    }
  }
  return null;
}

export function matchStoreInSegment(segment: string): string | null {
  const lower = segment.toLowerCase();
  for (const root of STORE_ROOTS) {
    if (lower === root) {
      return root;
    }
  }
  return null;
}

export function scanIdentifier(identifier: string): string | null {
  for (const segment of splitIdentifierSegments(identifier)) {
    const inventoryMatch = matchInventoryInSegment(segment);
    if (inventoryMatch) {
      return inventoryMatch;
    }

    const storeMatch = matchStoreInSegment(segment);
    if (storeMatch) {
      return storeMatch;
    }
  }

  return null;
}

export function scanPathComponent(component: string): string | null {
  const parts = component.toLowerCase().split(/[-._]/).filter(Boolean);
  for (const part of parts) {
    for (const root of INVENTORY_ROOTS) {
      if (part === root || part.startsWith(root)) {
        return root;
      }
    }
    for (const root of STORE_ROOTS) {
      if (part === root) {
        return root;
      }
    }
  }

  return null;
}

export function scanPath(repoRelativePath: string): TerminologyViolation | null {
  const segments = repoRelativePath.split("/").filter(Boolean);
  for (const segment of segments) {
    const matchedToken = scanPathComponent(segment);
    if (matchedToken) {
      return {
        file: repoRelativePath,
        line: 0,
        matchedToken,
        category: "PATH_NAME",
        text: segment,
      };
    }
  }

  return null;
}

function stripQuotedStrings(line: string): string {
  return line
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\.|[^`\\])*`/g, "``");
}

function stripLineComments(line: string): string {
  const withoutBlock = line.replace(/\/\*.*?\*\//g, "");
  const hashIndex = withoutBlock.indexOf("#");
  const slashIndex = withoutBlock.indexOf("//");
  const cutIndexes = [slashIndex, hashIndex].filter((index) => index >= 0);
  if (cutIndexes.length === 0) {
    return withoutBlock;
  }
  return withoutBlock.slice(0, Math.min(...cutIndexes));
}

export function scanCodeLine(
  repoRelativePath: string,
  lineNumber: number,
  line: string,
): TerminologyViolation[] {
  const violations: TerminologyViolation[] = [];
  const codePortion = stripLineComments(line);
  const withoutStrings = stripQuotedStrings(codePortion);

  let match: RegExpExecArray | null;
  IDENTIFIER_PATTERN.lastIndex = 0;
  while ((match = IDENTIFIER_PATTERN.exec(withoutStrings)) !== null) {
    const identifier = match[0];
    const matchedToken = scanIdentifier(identifier);
    if (matchedToken) {
      violations.push({
        file: repoRelativePath,
        line: lineNumber,
        matchedToken,
        category: "CONTENT_IDENTIFIER",
        text: identifier,
      });
    }
  }

  let copyMatch: RegExpExecArray | null;
  COPY_PATTERN.lastIndex = 0;
  while ((copyMatch = COPY_PATTERN.exec(line)) !== null) {
    violations.push({
      file: repoRelativePath,
      line: lineNumber,
      matchedToken: copyMatch[0].toLowerCase(),
      category: "CONTENT_COPY",
      text: line.trim().slice(0, 160),
    });
  }

  return violations;
}

export function scanConfigurationLine(
  repoRelativePath: string,
  lineNumber: number,
  line: string,
): TerminologyViolation[] {
  const violations: TerminologyViolation[] = [];
  let match: RegExpExecArray | null;
  CONFIG_SCRIPT_PATTERN.lastIndex = 0;
  while ((match = CONFIG_SCRIPT_PATTERN.exec(line)) !== null) {
    violations.push({
      file: repoRelativePath,
      line: lineNumber,
      matchedToken: match[1].toLowerCase(),
      category: "CONFIGURATION",
      text: line.trim().slice(0, 160),
    });
  }

  return violations;
}

export function scanPackageJson(
  repoRelativePath: string,
  content: string,
): TerminologyViolation[] {
  const violations: TerminologyViolation[] = [];
  let parsed: { scripts?: Record<string, string> };
  try {
    parsed = JSON.parse(content) as { scripts?: Record<string, string> };
  } catch {
    return [
      {
        file: repoRelativePath,
        line: 0,
        matchedToken: "invalid-json",
        category: "CONFIGURATION",
        text: "Unable to parse package.json",
      },
    ];
  }

  for (const [scriptName, command] of Object.entries(parsed.scripts ?? {})) {
    const scriptSegments = scriptName.split(/[:/]/).filter(Boolean);
    const scriptMatch = scriptSegments
      .map((segment) => scanIdentifier(segment) ?? scanPathComponent(segment))
      .find(Boolean);

    if (scriptMatch) {
      violations.push({
        file: repoRelativePath,
        line: 0,
        matchedToken: scriptMatch,
        category: "CONFIGURATION",
        text: `scripts.${scriptName}`,
      });
    }

    const commandViolations = scanConfigurationLine(repoRelativePath, 0, command);
    violations.push(...commandViolations);
  }

  return violations;
}

export function isAllowlistedViolation(
  repoRelativePath: string,
  line: string,
  violation: TerminologyViolation,
  allowedByFile: Record<string, RegExp[]>,
): boolean {
  const patterns = allowedByFile[repoRelativePath];
  if (!patterns) {
    return false;
  }

  const haystack = `${line}\n${violation.text}\n${violation.matchedToken}`;
  return patterns.some((pattern) => pattern.test(haystack));
}
