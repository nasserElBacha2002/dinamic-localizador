export interface ServiceReferenceInput {
  name: string;
  address?: string | null;
  locality?: string | null;
}

export interface ServiceReferenceFields {
  serviceName: string;
  serviceAddress?: string | null;
  serviceLocality?: string | null;
}

const normalizePart = (value?: string | null): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeForCompare = (value: string): string => value.trim().toLocaleLowerCase("es-AR");

export const formatServiceReference = (input: ServiceReferenceInput): string => {
  const name = normalizePart(input.name);
  if (!name) {
    return "";
  }

  const parts = [name];
  const address = normalizePart(input.address);
  const locality = normalizePart(input.locality);

  if (address && normalizeForCompare(address) !== normalizeForCompare(name)) {
    parts.push(address);
  }

  if (
    locality &&
    !parts.some((part) => normalizeForCompare(part) === normalizeForCompare(locality))
  ) {
    parts.push(locality);
  }

  return parts.join(" - ");
};

export const formatServiceReferenceFromFields = (fields: ServiceReferenceFields): string =>
  formatServiceReference({
    name: fields.serviceName,
    address: fields.serviceAddress,
    locality: fields.serviceLocality,
  });
