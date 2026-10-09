import { z } from "zod";
import { clientRepository } from "../repositories/client.repository";
import type { Client } from "../types/domain";
import { normalizeClientName } from "../utils/client-name.utils";
import { rowError } from "./column-import-helpers";
import type { ImportRowError } from "./types";

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

const resolutionFromClient = (client: Client | undefined): ImportClientResolution => {
  if (!client) {
    return notFoundClient();
  }
  if (!client.isActive) {
    return inactiveClient();
  }
  return { clientId: client.id, error: null };
};

export const loadImportClientsByIds = async (
  companyId: string,
  clientIds: string[],
): Promise<Map<string, Client>> => {
  const unique = [...new Set(clientIds.filter(Boolean))];
  if (unique.length === 0) {
    return new Map();
  }

  const clients = await clientRepository.listByIds(companyId, unique);
  return new Map(clients.map((client) => [client.id, client]));
};

export const importClientRowErrors = (
  clientIds: string[],
  clientById: Map<string, Client>,
  field: string,
  displayValue: string | null,
): ImportRowError[] => {
  const errors: ImportRowError[] = [];
  for (const clientId of clientIds) {
    const client = clientById.get(clientId);
    if (!client) {
      errors.push(rowError("CLIENT_NOT_FOUND", "Cliente no encontrado.", field, displayValue));
      return errors;
    }
    if (!client.isActive) {
      errors.push(
        rowError(
          "CLIENT_INACTIVE",
          "No se puede asignar un cliente inactivo.",
          field,
          displayValue,
        ),
      );
      return errors;
    }
  }
  return errors;
};

export const buildImportClientLookup = async (
  companyId: string,
  rawValues: string[],
): Promise<Map<string, ImportClientResolution>> => {
  const unique = [...new Set(rawValues.map((value) => value.trim()).filter(Boolean))];
  const lookup = new Map<string, ImportClientResolution>();
  if (unique.length === 0) {
    return lookup;
  }

  const uuidRawValues: string[] = [];
  const nameRawValues: string[] = [];
  for (const value of unique) {
    const parsedUuid = uuidSchema.safeParse(value);
    if (parsedUuid.success) {
      uuidRawValues.push(value);
    } else {
      nameRawValues.push(value);
    }
  }

  const clientsById = new Map<string, Client>();
  if (uuidRawValues.length > 0) {
    const uuidIds = uuidRawValues.map((value) => uuidSchema.parse(value));
    const clients = await clientRepository.listByIds(companyId, uuidIds);
    for (const client of clients) {
      clientsById.set(client.id, client);
    }
  }

  const clientsByNormalizedName = new Map<string, Client>();
  if (nameRawValues.length > 0) {
    const clients = await clientRepository.listByNormalizedNames(
      companyId,
      nameRawValues.map((value) => normalizeClientName(value)),
    );
    for (const client of clients) {
      clientsByNormalizedName.set(normalizeClientName(client.name), client);
    }
  }

  for (const value of unique) {
    const parsedUuid = uuidSchema.safeParse(value);
    if (parsedUuid.success) {
      lookup.set(value, resolutionFromClient(clientsById.get(parsedUuid.data)));
      continue;
    }

    const normalized = normalizeClientName(value);
    lookup.set(
      value,
      resolutionFromClient(clientsByNormalizedName.get(normalized)),
    );
  }

  return lookup;
};

export const resolveImportClientReference = async (
  companyId: string,
  raw: string | null | undefined,
): Promise<ImportClientResolution> => {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) {
    return { clientId: null, error: null };
  }

  const lookup = await buildImportClientLookup(companyId, [trimmed]);
  return lookup.get(trimmed) ?? notFoundClient();
};
