export const isCommercialDescriptionAddress = (address: string): boolean => {
  const trimmed = address.trim();
  return /^market\b/i.test(trimmed) || /^\d+\s*-\s*market\b/i.test(trimmed);
};

export const isMalformedOfficialAddress = (address: string): boolean => {
  const trimmed = address.trim();
  return /^\d+\s*-\s*/.test(trimmed) && isCommercialDescriptionAddress(trimmed);
};

export const isLabelOnlyOfficialAddress = (address: string): boolean => {
  const trimmed = address.trim();
  if (!trimmed) {
    return true;
  }

  if (isCommercialDescriptionAddress(trimmed)) {
    return true;
  }

  if (/^\d+\s*-\s*[^,]+$/i.test(trimmed) && !/\b(av|calle|avenida|ruta|pasaje)\b/i.test(trimmed)) {
    return true;
  }

  return false;
};
