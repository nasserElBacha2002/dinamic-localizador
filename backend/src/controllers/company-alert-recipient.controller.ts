import type { Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { companyAlertRecipientRepository } from "../repositories/company-alert-recipient.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
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

export const companyAlertRecipientController = {
  async list(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const recipients = await companyAlertRecipientRepository.listByCompany(companyId);
    res.json({ data: recipients });
  },

  async create(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const input = req.body as CreateCompanyAlertRecipientInput;

    let phoneNumber: string;
    try {
      phoneNumber = normalizePhoneNumber(input.phoneNumber);
    } catch {
      throw new AppError(400, "INVALID_PHONE", "El teléfono debe estar en formato E.164.");
    }

    await assertRecipientUserBelongsToCompany(companyId, input.userId ?? null);

    try {
      const created = await companyAlertRecipientRepository.create(companyId, {
        ...input,
        phoneNumber,
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
