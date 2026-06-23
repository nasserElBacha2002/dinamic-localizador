const stripBom = (content: string): string => content.replace(/^\uFEFF/, "");

const detectDelimiter = (headerLine: string): "," | ";" => {
  const commaCount = (headerLine.match(/,/g) ?? []).length;
  const semicolonCount = (headerLine.match(/;/g) ?? []).length;
  return semicolonCount > commaCount ? ";" : ",";
};

const parseCsvLine = (line: string, delimiter: "," | ";"): string[] => {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
};

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export const parseCsvContent = (content: string): ParsedCsv => {
  const normalized = stripBom(content).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const delimiter = detectDelimiter(lines[0]);
  const headers = parseCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => parseCsvLine(line, delimiter));

  return { headers, rows };
};

export const normalizeCsvHeader = (header: string): string =>
  header
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, "_");

export const isLikelyBinaryUpload = (content: string): boolean =>
  content.startsWith("PK") || content.includes("\u0000");
