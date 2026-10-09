import { z } from "zod";
import { clientRepository } from "../repositories/client.repository";
import { normalizeClientName } from "../utils/client-name.utils";

const uuidSchema = z.string().uuid();

export type ImportClientResolution = {
  clientId: string | null;
  error: { code: string; message: string } | null;
};

const inactiveClient = (): ImportClientResolution => ({
  clientId: null,
  error: {
    code: "CLIENT_INACTIVE",
    message: "No se puede asignar un cliente inactivo.",
  },
});

const notFoundClient = (): ImportClientResolution => ({
  clientId: null,
  error: {
    code: "CLIENT_NOT_FOUND",
    message: "Cliente no encontrado.",
  },
});

const invalidReference = (): ImportClientResolution => ({
  clientId: null,
  error: {
    code: "CLIENT_REFERENCE_INVALID",
    message: "Referencia de cliente inválida. Usá el nombre o el UUID del cliente.",
  },
});

export const resolveImportClientReference = async (
  companyId: string,
  raw: string | null | undefined,
): Promise<ImportClientResolution> => {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return { clientId: null, error: null };
  }

  const parsedUuid = uuidSchema.safeParse(trimmed);
  if (parsedUuid.success) {
    const client = await clientRepository.findById(companyId, parsedUuid.data);
    if (!client) {
      return notFoundClient();
    }
    if (!client.isActive) {
      return inactiveClient();
    }
    return { clientId: client.id, error: null };
  }

  const normalizedName = normalizeClientName(trimmed);
  const client = await clientRepository.findByNormalizedName(companyId, normalizedName);
  if (!client) {
    return notFoundClient();
  }
  if (!client.isActive) {
    return inactiveClient();
  }
  return { clientId: client.id, error: null };
};

export const buildImportClientLookup = async (
  companyId: string,
  rawValues: string[],
): Promise<Map<string, ImportClientResolution>> => {
  const unique = [...new Set(rawValues.map((value) => value.trim()).filter(Boolean))];
  const lookup = new Map<string, ImportClientResolution>();

  for (const value of unique) {
    lookup.set(value, await resolveImportClientReference(companyId, value));
  }

  return lookup;
};
