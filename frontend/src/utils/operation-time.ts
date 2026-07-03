export function normalizeOperationTimeValue(raw: string): string {
  if (!raw.trim()) {
    return "";
  }

  const match = raw.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) {
    return raw.trim();
  }

  const hours = match[1].padStart(2, "0");
  const minutes = match[2];
  return `${hours}:${minutes}`;
}
