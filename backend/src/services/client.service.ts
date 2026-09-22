import { AppError } from "../errors/app-error";
import { clientRepository } from "../repositories/client.repository";
import type {
  CreateClientInput,
  ListClientsQuery,
  UpdateClientInput,
} from "../schemas/client.schema";
import { buildPaginationMeta } from "../utils/pagination";
import { normalizeClientName } from "../utils/client-name.utils";
import { auditService } from "./audit.service";

const getClientOrThrow = async (companyId: string, clientId: string) => {
  const client = await clientRepository.findById(companyId, clientId);

  if (!client) {
    throw new AppError(
      404,
      "CLIENT_NOT_FOUND",
      "Cliente no encontrado",
    );
  }

  return client;
};

export const clientService = {
  async create(
    companyId: string,
    userId: string | null,
    input: CreateClientInput,
  ) {
    const name = input.name.trim();
    const normalizedName = normalizeClientName(name);

    const existing = await clientRepository.findByNormalizedName(
      companyId,
      normalizedName,
    );

    if (existing) {
      throw new AppError(
        409,
        "CLIENT_NAME_ALREADY_EXISTS",
        "Ya existe un cliente con ese nombre",
      );
    }

    try {
      const client = await clientRepository.create(companyId, {
        name,
        normalizedName,
        createdBy: userId,
      });

      await auditService.log(companyId, {
        entityType: "client",
        entityId: client.id,
        action: "create",
        newData: {
          name: client.name,
          isActive: client.isActive,
        },
        userId,
      });

      return client;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "CLIENT_NAME_ALREADY_EXISTS"
      ) {
        throw new AppError(
          409,
          "CLIENT_NAME_ALREADY_EXISTS",
          "Ya existe un cliente con ese nombre",
        );
      }

      throw error;
    }
  },

  async list(companyId: string, query: ListClientsQuery) {
    const result = await clientRepository.list(companyId, query);

    return {
      data: result.items,
      meta: buildPaginationMeta(
        query.page,
        query.limit,
        result.total,
      ),
    };
  },

  async getById(companyId: string, clientId: string) {
    return getClientOrThrow(companyId, clientId);
  },

  async update(
    companyId: string,
    clientId: string,
    userId: string | null,
    input: UpdateClientInput,
  ) {
    const current = await getClientOrThrow(companyId, clientId);

    const updatePayload: {
      name?: string;
      normalizedName?: string;
      updatedBy: string | null;
    } = {
      updatedBy: userId,
    };

    if (input.name !== undefined) {
      const name = input.name.trim();
      const normalizedName = normalizeClientName(name);

      const duplicate =
        await clientRepository.findByNormalizedName(
          companyId,
          normalizedName,
          clientId,
        );

      if (duplicate) {
        throw new AppError(
          409,
          "CLIENT_NAME_ALREADY_EXISTS",
          "Ya existe un cliente con ese nombre",
        );
      }

      updatePayload.name = name;
      updatePayload.normalizedName = normalizedName;
    }

    let updated;

    try {
      updated = await clientRepository.update(
        companyId,
        clientId,
        updatePayload,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "CLIENT_NAME_ALREADY_EXISTS"
      ) {
        throw new AppError(
          409,
          "CLIENT_NAME_ALREADY_EXISTS",
          "Ya existe un cliente con ese nombre",
        );
      }

      throw error;
    }

    if (!updated) {
      throw new AppError(
        404,
        "CLIENT_NOT_FOUND",
        "Cliente no encontrado",
      );
    }

    await auditService.log(companyId, {
      entityType: "client",
      entityId: clientId,
      action: "update",
      previousData: {
        name: current.name,
        isActive: current.isActive,
      },
      newData: {
        name: updated.name,
        isActive: updated.isActive,
      },
      userId,
    });

    return updated;
  },

  async activate(
    companyId: string,
    clientId: string,
    userId: string | null,
  ) {
    const current = await getClientOrThrow(
      companyId,
      clientId,
    );

    if (current.isActive) {
      return current;
    }

    const updated = await clientRepository.update(
      companyId,
      clientId,
      {
        isActive: true,
        updatedBy: userId,
      },
    );

    if (!updated) {
      throw new AppError(
        404,
        "CLIENT_NOT_FOUND",
        "Cliente no encontrado",
      );
    }

    await auditService.log(companyId, {
      entityType: "client",
      entityId: clientId,
      action: "activate",
      previousData: {
        isActive: current.isActive,
      },
      newData: {
        isActive: updated.isActive,
      },
      userId,
    });

    return updated;
  },

  async deactivate(
    companyId: string,
    clientId: string,
    userId: string | null,
  ) {
    const current = await getClientOrThrow(
      companyId,
      clientId,
    );

    if (!current.isActive) {
      return current;
    }

    const updated = await clientRepository.update(
      companyId,
      clientId,
      {
        isActive: false,
        updatedBy: userId,
      },
    );

    if (!updated) {
      throw new AppError(
        404,
        "CLIENT_NOT_FOUND",
        "Cliente no encontrado",
      );
    }

    await auditService.log(companyId, {
      entityType: "client",
      entityId: clientId,
      action: "deactivate",
      previousData: {
        isActive: current.isActive,
      },
      newData: {
        isActive: updated.isActive,
      },
      userId,
    });

    return updated;
  },
};