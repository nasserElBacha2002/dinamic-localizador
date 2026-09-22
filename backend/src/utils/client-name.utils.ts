export const normalizeClientName = (value: string): string =>
  value.trim().replace(/\s+/g, " ").toLowerCase();