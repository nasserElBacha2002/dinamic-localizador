export const normalizeStoreNumber = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d+(\.0+)?$/.test(trimmed)) {
    return String(Math.trunc(Number(trimmed)));
  }

  if (/^\d+$/.test(trimmed)) {
    const withoutLeadingZeros = trimmed.replace(/^0+/, "");
    return withoutLeadingZeros || "0";
  }

  return null;
};

export const isNumericStoreName = (name: string): boolean => normalizeStoreNumber(name) !== null;
