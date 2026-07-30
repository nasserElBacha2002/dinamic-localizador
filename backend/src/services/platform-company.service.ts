import sql from "mssql";
import { DEFAULT_COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { toCompanySettingsInput } from "../constants/company-settings";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companyModuleRepository } from "../repositories/company-module.repository";
import { companyRepository } from "../repositories/company.repository";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import { userRepository } from "../repositories/user.repository";
import type { CreatePlatformCompanyInput } from "../schemas/platform-company.schema";
import { companyAbsenceSettingsService } from "./company-absence-settings.service";
import { companyLocationTypesService } from "./company-location-types.service";
import { companyWorkScheduleService } from "./company-work-schedule.service";
import {
  invitationExpiresAt,
  persistPendingInvitation,
  userInvitationService,
} from "./user-invitation.service";
import { normalizeEmail } from "../utils/password";
import { generateInvitationToken, hashInvitationToken } from "../utils/invitation-token";
import { getDuplicateKeyConstraint, isDuplicateKeyError } from "../utils/sql-server-errors";

function mapCompanyCreateDuplicateError(error: unknown): never {
  const constraint = getDuplicateKeyConstraint(error)?.toLowerCase() ?? "";
  if (constraint.includes("uq_companies_name") || constraint.includes("companies_name")) {
    throw new AppError(
      409,
      "COMPANY_NAME_ALREADY_EXISTS",
      "Ya existe una empresa con ese nombre.",
    );
  }
  if (constraint.includes("token_hash")) {
    throw new AppError(
      409,
      "INVITATION_TOKEN_CONFLICT",
      "No se pudo emitir la invitación del dueño. Reintentá la creación.",
    );
  }
  if (constraint.includes("company_email") || constraint.includes("pending")) {
    throw new AppError(
      409,
      "INVITATION_ALREADY_PENDING",
      "Ya existe una invitación pendiente para ese email en la empresa.",
    );
  }
  throw new AppError(
    500,
    "COMPANY_CREATE_CONFLICT",
    "No se pudo crear la empresa por un conflicto de datos. Reintentá.",
  );
}

export const platformCompanyService = {
  async listCompanies() {
    return companyRepository.listActiveWithOwner();
  },

  async createCompany(input: CreatePlatformCompanyInput, actorUserId: string) {
    const existingCompany = await companyRepository.findByName(input.name.trim());
    if (existingCompany) {
      throw new AppError(
        409,
        "COMPANY_NAME_ALREADY_EXISTS",
        "Ya existe una empresa con ese nombre.",
      );
    }

    const email = normalizeEmail(input.owner.email);
    const existingOwner = await userRepository.findByEmail(email);
    const rawToken = generateInvitationToken();
    const tokenHash = hashInvitationToken(rawToken);
    const expiresAt = invitationExpiresAt();

    const pool = getPool();
    const transaction = new sql.Transaction(pool);

    let company: Awaited<ReturnType<typeof companyRepository.create>>;
    let invitation: Awaited<ReturnType<typeof persistPendingInvitation>>;

    try {
      await transaction.begin();

      company = await companyRepository.create(
        {
          name: input.name.trim(),
          defaultTimezone: input.defaultTimezone,
          status: input.status,
        },
        transaction,
      );

      const defaultSettings = toCompanySettingsInput();
      const settingsInput = {
        ...defaultSettings,
        ...input.settings,
        operationTimezone:
          input.settings?.operationTimezone ??
          input.defaultTimezone ??
          defaultSettings.operationTimezone,
      };

      await companySettingsRepository.create(company.id, settingsInput, transaction);
      await companyAbsenceSettingsService.ensureAbsenceCatalogForCompany(company.id, transaction);
      await companyLocationTypesService.ensureLocationTypesCatalogForCompany(
        company.id,
        transaction,
      );
      await companyWorkScheduleService.ensureDefaultForCompany(
        company.id,
        settingsInput.operationTimezone,
        transaction,
      );
      const { absenceCalendarService } = await import("./absence-calendar.service");
      await absenceCalendarService.bootstrapDefaultCalendar(company.id, {
        timezone: settingsInput.operationTimezone,
        userId: actorUserId,
        transaction,
      });

      const moduleKeys = [
        ...new Set(input.modules?.length ? input.modules : DEFAULT_COMPANY_MODULE_KEYS),
      ];
      await companyModuleRepository.bulkEnable(company.id, moduleKeys, transaction);

      invitation = await persistPendingInvitation(
        {
          companyId: company.id,
          emailNormalized: email,
          inviteeName: input.owner.name.trim(),
          role: "OWNER",
          invitedByUserId: actorUserId,
          targetUserId: existingOwner?.id ?? null,
          tokenHash,
          origin: "COMPANY_CREATE",
          expiresAt,
        },
        transaction,
      );

      await transaction.commit();
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // Avoid masking the original error if rollback fails after abort.
      }
      if (isDuplicateKeyError(error)) {
        mapCompanyCreateDuplicateError(error);
      }
      throw error;
    }

    // Post-commit delivery: never roll back company creation on email/lookup failures.
    const emailResult = await userInvitationService.deliverEmail(invitation.id, rawToken);

    return {
      data: {
        company: {
          id: company.id,
          name: company.name,
          status: company.status,
          defaultTimezone: company.defaultTimezone,
        },
        ownerInvitation: {
          id: invitation.id,
          email: invitation.emailNormalized,
          status: invitation.status,
          expiresAt: invitation.expiresAt,
          emailSent: emailResult.sent,
          publicErrorCode: emailResult.publicErrorCode,
          deliveryStatus: emailResult.sent
            ? "SENT"
            : emailResult.publicErrorCode
              ? "FAILED"
              : "PENDING",
        },
        message: emailResult.sent
          ? "Empresa creada. Se envió una invitación al dueño para activar su acceso."
          : "Empresa creada e invitación pendiente. El correo no se pudo enviar; reenviá desde la empresa.",
      },
    };
  },
};
