export const escapeCsvValue = (value: string | number | null | undefined): string => {
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

export const buildCsv = (headers: string[], rows: Array<Array<string | number | null | undefined>>): string => {
  const lines = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(",")),
  ];
  return `\uFEFF${lines.join("\n")}`;
};
