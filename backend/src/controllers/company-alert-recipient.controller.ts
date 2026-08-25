import type { Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userRepository } from "../repositories/user.repository";
import type {
  CreateCompanyAlertRecipientInput,
  UpdateCompanyAlertRecipientInput,
} from "../schemas/company-alert-recipient.schema";
import { normalizePhoneNumber } from "../utils/phone";
import { requireRequestCompanyId } from "../utils/request-company";

const assertRecipientUserBelongsToCompany = async (
  companyId: string,
  userId: string | null | undefined,
): Promise<void> => {
  if (userId == null) {
    return;
  }

  const membership = await userCompanyMembershipRepository.findActiveMembership(userId, companyId);
  if (!membership) {
    throw new AppError(
      400,
      "INVALID_RECIPIENT_USER",
      "El usuario no pertenece a esta compañía.",
    );
  }
};

const resolvePhoneForCreate = async (
  companyId: string,
  input: CreateCompanyAlertRecipientInput,
): Promise<{ phoneNumber: string; displayName: string | null | undefined; userId: string | null }> => {
  if (input.userId) {
    await assertRecipientUserBelongsToCompany(companyId, input.userId);
    const user = await userRepository.findById(input.userId);
    if (!user) {
      throw new AppError(400, "INVALID_RECIPIENT_USER", "El usuario no existe.");
    }
    const fromUser = user.phoneNumber?.trim() || null;
    const fromInput = input.phoneNumber?.trim() || null;
    const rawPhone = fromInput || fromUser;
    if (!rawPhone) {
      throw new AppError(
        400,
        "USER_PHONE_REQUIRED",
        "El usuario no tiene teléfono configurado. Cargalo en Usuarios de la empresa.",
      );
    }
    let phoneNumber: string;
    try {
      phoneNumber = normalizePhoneNumber(rawPhone);
    } catch {
      throw new AppError(400, "INVALID_PHONE", "El teléfono debe estar en formato E.164.");
    }
    return {
      phoneNumber,
      displayName: input.displayName ?? user.name,
      userId: input.userId,
    };
  }

  if (!input.phoneNumber?.trim()) {
    throw new AppError(400, "INVALID_PHONE", "El teléfono es obligatorio.");
  }
  try {
    return {
      phoneNumber: normalizePhoneNumber(input.phoneNumber),
      displayName: input.displayName,
      userId: null,
    };
  } catch {
    throw new AppError(400, "INVALID_PHONE", "El teléfono debe estar en formato E.164.");
  }
};

export const companyAlertRecipientController = {
  async list(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const recipients = await companyAlertRecipientRepository.listByCompany(companyId);
    res.json({ data: recipients });
  },

  async create(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const input = req.body as CreateCompanyAlertRecipientInput;
    const resolved = await resolvePhoneForCreate(companyId, input);

    try {
      const created = await companyAlertRecipientRepository.create(companyId, {
        ...input,
        userId: resolved.userId,
        phoneNumber: resolved.phoneNumber,
        displayName: resolved.displayName,
      });
      res.status(201).json({ data: created });
    } catch (error) {
      if (error instanceof Error && error.message === "COMPANY_ALERT_RECIPIENT_DUPLICATE_PHONE") {
        throw new AppError(
          409,
          "DUPLICATE_PHONE",
          "Ya existe un destinatario con ese teléfono en la compañía.",
        );
      }
      throw error;
    }
  },

  async update(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const recipientId = String(req.params.recipientId);
    const input = req.body as UpdateCompanyAlertRecipientInput;

    const payload: UpdateCompanyAlertRecipientInput = { ...input };
    if (input.phoneNumber !== undefined) {
      try {
        payload.phoneNumber = normalizePhoneNumber(input.phoneNumber);
      } catch {
        throw new AppError(400, "INVALID_PHONE", "El teléfono debe estar en formato E.164.");
      }
    }

    if (input.userId !== undefined) {
      await assertRecipientUserBelongsToCompany(companyId, input.userId);
    }

    try {
      const updated = await companyAlertRecipientRepository.update(
        companyId,
        recipientId,
        payload,
      );
      if (!updated) {
        throw new AppError(404, "NOT_FOUND", "Destinatario no encontrado.");
      }
      res.json({ data: updated });
    } catch (error) {
      if (error instanceof Error && error.message === "COMPANY_ALERT_RECIPIENT_DUPLICATE_PHONE") {
        throw new AppError(
          409,
          "DUPLICATE_PHONE",
          "Ya existe un destinatario con ese teléfono en la compañía.",
        );
      }
      throw error;
    }
  },

  async remove(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const recipientId = String(req.params.recipientId);
    const disabled = await companyAlertRecipientRepository.disable(companyId, recipientId);
    if (!disabled) {
      throw new AppError(404, "NOT_FOUND", "Destinatario no encontrado.");
    }
    res.status(204).end();
  },
};
