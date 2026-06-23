import * as XLSX from "xlsx";

type ExportCell = string | number | null | undefined;

const escapeCsvValue = (value: ExportCell): string => {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value);
  const needsEscaping = /[",\n\r]/.test(stringValue) || /^[=+\-@]/.test(stringValue);
  const safeValue = needsEscaping && /^[=+\-@]/.test(stringValue) ? `'${stringValue}` : stringValue;

  if (needsEscaping) {
    return `"${safeValue.replace(/"/g, '""')}"`;
  }

  return safeValue;
};

export function exportToCsv(filename: string, headers: string[], rows: ExportCell[][]): void {
  const lines = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(",")),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function exportToXlsx(
  filename: string,
  headers: string[],
  rows: ExportCell[][],
  sheetName = "Datos",
): void {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const outputName = filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, outputName);
}

export function buildExportFilename(base: string, dateFrom?: string, dateTo?: string): string {
  const from = dateFrom ? dateFrom.slice(0, 10) : "inicio";
  const to = dateTo ? dateTo.slice(0, 10) : "fin";
  return `${base}-${from}-to-${to}`;
}

export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}
