import sql from "mssql";
import { env } from "../config/env";
import { getPool } from "../database/connection";
import { AppError } from "../errors/app-error";
import { companyRepository } from "../repositories/company.repository";
import { userCompanyMembershipRepository } from "../repositories/user-company-membership.repository";
import { userInvitationRepository } from "../repositories/user-invitation.repository";
import { userRepository } from "../repositories/user.repository";
import type { CompanyRole } from "../types/company";
import type {
  UserInvitation,
  UserInvitationOrigin,
  UserInvitationPublicPreview,
  UserInvitationStatus,
} from "../types/user-invitation";
import { resolveInvitationDeliveryStatus } from "../types/user-invitation";
import { hashPassword, normalizeEmail } from "../utils/password";
import { assertPasswordPolicy } from "../utils/password-policy";
import { buildPaginationMeta } from "../utils/pagination";
import {
  generateInvitationToken,
  hashInvitationToken,
} from "../utils/invitation-token";
import { getDuplicateKeyConstraint, isDuplicateKeyError } from "../utils/sql-server-errors";
import { logAuditSafe } from "../utils/audit-post-commit";
import { sendEmail } from "./email.service";
import { buildInvitationEmail } from "./invitation-email";
import { auditService } from "./audit.service";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

export function invitationExpiresAt(now = Date.now()): Date {
  return new Date(now + env.INVITATION_TTL_HOURS * 60 * 60 * 1000);
}

function mapInvitationDuplicateError(error: unknown): never {
  const constraint = getDuplicateKeyConstraint(error)?.toLowerCase() ?? "";
  if (constraint.includes("token_hash") || constraint.includes("token")) {
    throw new AppError(
      409,
      "INVITATION_TOKEN_CONFLICT",
      "No se pudo emitir el token de invitación. Reintentá.",
    );
  }
  if (constraint.includes("company_email") || constraint.includes("pending")) {
    throw new AppError(
      409,
      "INVITATION_ALREADY_PENDING",
      "Ya existe una invitación pendiente para ese email.",
    );
  }
  throw new AppError(
    409,
    "INVITATION_ALREADY_PENDING",
    "Ya existe una invitación pendiente para ese email.",
  );
}

export interface IssueInvitationInput {
  companyId: string;
  email: string;
  role: CompanyRole;
  inviteeName?: string | null;
  invitedByUserId: string | null;
  origin: UserInvitationOrigin;
  /** When false, OWNER role cannot be assigned. */
  canAssignOwner?: boolean;
}

export interface IssueInvitationResult {
  invitation: UserInvitation;
  emailSent: boolean;
  publicErrorCode: string | null;
  reusedPending: boolean;
  message: string;
}

async function sendInvitationEmailSafe(input: {
  invitation: UserInvitation;
  companyName: string;
  rawToken: string;
  userExists: boolean;
}): Promise<{ sent: boolean; publicErrorCode: string | null }> {
  const content = buildInvitationEmail({
    to: input.invitation.emailNormalized,
    companyName: input.companyName,
    inviteeName: input.invitation.inviteeName,
    userExists: input.userExists,
    origin: input.invitation.origin,
    expiresAt: new Date(input.invitation.expiresAt),
    rawToken: input.rawToken,
  });

  try {
    const result = await sendEmail(content);
    if (result.sent) {
      await userInvitationRepository.recordEmailResult(input.invitation.id, {
        sentAt: new Date(),
        publicErrorCode: null,
        internalError: null,
      });
      await logAuditSafe("user_invitation.email_sent", () =>
        auditService.log(input.invitation.companyId, {
          entityType: "user_invitation",
          entityId: input.invitation.id,
          action: "email_sent",
          newData: { transport: result.transport },
          userId: input.invitation.invitedByUserId,
        }),
      );
      return { sent: true, publicErrorCode: null };
    }

    const publicErrorCode = result.publicErrorCode ?? "EMAIL_DELIVERY_FAILED";
    await userInvitationRepository.recordEmailResult(input.invitation.id, {
      publicErrorCode,
      internalError: null,
    });
    await logAuditSafe("user_invitation.email_pending", () =>
      auditService.log(input.invitation.companyId, {
        entityType: "user_invitation",
        entityId: input.invitation.id,
        action: "email_delivery_pending",
        newData: { code: publicErrorCode, transport: result.transport },
        userId: input.invitation.invitedByUserId,
      }),
    );
    return { sent: false, publicErrorCode };
  } catch (error) {
    const internal =
      error instanceof Error
        ? redactInternalEmailError(error.message).slice(0, 480)
        : "EMAIL_SEND_FAILED";
    console.error("[invitation-email]", {
      invitationId: input.invitation.id,
      code: "EMAIL_DELIVERY_FAILED",
      detail: internal,
    });
    await userInvitationRepository.recordEmailResult(input.invitation.id, {
      publicErrorCode: "EMAIL_DELIVERY_FAILED",
      internalError: internal,
    });
    await logAuditSafe("user_invitation.email_failed", () =>
      auditService.log(input.invitation.companyId, {
        entityType: "user_invitation",
        entityId: input.invitation.id,
        action: "email_failed",
        newData: { code: "EMAIL_DELIVERY_FAILED" },
        userId: input.invitation.invitedByUserId,
      }),
    );
    return { sent: false, publicErrorCode: "EMAIL_DELIVERY_FAILED" };
  }
}

/** Strip likely credentials / hosts from SMTP errors before persisting internals. */
function redactInternalEmailError(message: string): string {
  return message
    .replace(/pass(word)?[=:]\S+/gi, "password=[REDACTED]")
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, "[REDACTED_EMAIL]");
}

/**
 * Persists a pending invitation inside an existing transaction without sending email.
 * Used by company creation and other multi-step commits.
 */
export async function persistPendingInvitation(
  input: {
    companyId: string;
    emailNormalized: string;
    inviteeName?: string | null;
    role: CompanyRole;
    invitedByUserId: string | null;
    targetUserId?: string | null;
    tokenHash: string;
    origin: UserInvitationOrigin;
    expiresAt: Date;
  },
  transaction: sql.Transaction,
): Promise<UserInvitation> {
  try {
    return await userInvitationRepository.create(
      {
        companyId: input.companyId,
        emailNormalized: input.emailNormalized,
        inviteeName: input.inviteeName ?? null,
        role: input.role,
        invitedByUserId: input.invitedByUserId,
        targetUserId: input.targetUserId ?? null,
        tokenHash: input.tokenHash,
        origin: input.origin,
        expiresAt: input.expiresAt,
      },
      transaction,
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      mapInvitationDuplicateError(error);
    }
    throw error;
  }
}

export const userInvitationService = {
  async issueInvitation(input: IssueInvitationInput): Promise<IssueInvitationResult> {
    const company = await companyRepository.findById(input.companyId);
    if (!company || company.status !== "ACTIVE") {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    }

    const canAssignOwner = input.canAssignOwner ?? true;
    if (input.role === "OWNER" && !canAssignOwner) {
      throw new AppError(
        403,
        "ROLE_NOT_ASSIGNABLE",
        "No tenés permisos para invitar con rol de dueño.",
      );
    }

    const email = normalizeEmail(input.email);
    const existingUser = await userRepository.findByEmail(email);

    if (existingUser) {
      const membership = await userCompanyMembershipRepository.findMembership(
        existingUser.id,
        input.companyId,
      );
      if (membership?.status === "ACTIVE") {
        throw new AppError(
          409,
          "MEMBERSHIP_ALREADY_EXISTS",
          "El usuario ya tiene acceso activo a esta empresa.",
        );
      }
    }

    const rawToken = generateInvitationToken();
    const tokenHash = hashInvitationToken(rawToken);
    const expiresAt = invitationExpiresAt();

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let invitation: UserInvitation;
    let reusedPending = false;
    let skippedBecauseInProgress = false;

    try {
      const pending = await userInvitationRepository.findPendingByCompanyEmailForUpdate(
        input.companyId,
        email,
        transaction,
      );

      if (pending) {
        if (pending.lastEmailErrorCode === "EMAIL_SEND_IN_PROGRESS") {
          invitation = pending;
          reusedPending = true;
          skippedBecauseInProgress = true;
        } else {
          const replaced = await userInvitationRepository.replaceTokenIfVersion(
            pending.id,
            pending.tokenVersion,
            tokenHash,
            expiresAt,
            input.origin === "MANUAL" ? "RESEND" : input.origin,
            transaction,
          );
          if (!replaced) {
            throw new AppError(
              409,
              "INVITATION_CONFLICT",
              "No se pudo actualizar la invitación pendiente. Reintentá.",
            );
          }
          invitation = replaced;
          reusedPending = true;
        }
      } else {
        try {
          invitation = await userInvitationRepository.create(
            {
              companyId: input.companyId,
              emailNormalized: email,
              inviteeName: input.inviteeName?.trim() || null,
              role: input.role,
              invitedByUserId: input.invitedByUserId,
              targetUserId: existingUser?.id ?? null,
              tokenHash,
              origin: input.origin,
              expiresAt,
            },
            transaction,
          );
          await userInvitationRepository.recordEmailResult(
            invitation.id,
            { publicErrorCode: "EMAIL_SEND_IN_PROGRESS", internalError: null },
            transaction,
          );
          invitation = {
            ...invitation,
            lastEmailErrorCode: "EMAIL_SEND_IN_PROGRESS",
          };
        } catch (error) {
          if (isDuplicateKeyError(error)) {
            mapInvitationDuplicateError(error);
          }
          throw error;
        }
      }

      await transaction.commit();
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // Transaction may already be aborted.
      }
      throw error;
    }

    if (skippedBecauseInProgress) {
      return {
        invitation,
        emailSent: false,
        publicErrorCode: "EMAIL_SEND_IN_PROGRESS",
        reusedPending: true,
        message: "Ya hay un envío de invitación en curso. Esperá un momento y reintentá si hace falta.",
      };
    }

    await logAuditSafe(
      reusedPending ? "user_invitation.resent" : "user_invitation.created",
      () =>
        auditService.log(input.companyId, {
          entityType: "user_invitation",
          entityId: invitation.id,
          action: reusedPending ? "invitation_resent" : "invitation_created",
          newData: {
            emailMasked: maskEmail(email),
            role: invitation.role,
            origin: invitation.origin,
            userExists: Boolean(existingUser),
            tokenVersion: invitation.tokenVersion,
          },
          userId: input.invitedByUserId,
        }),
    );

    const emailResult = await sendInvitationEmailSafe({
      invitation,
      companyName: company.name,
      rawToken,
      userExists: Boolean(existingUser),
    });

    return {
      invitation,
      emailSent: emailResult.sent,
      publicErrorCode: emailResult.publicErrorCode,
      reusedPending,
      message: emailResult.sent
        ? reusedPending
          ? "Invitación reenviada. El enlace anterior quedó invalidado."
          : "Invitación enviada por correo."
        : "Invitación creada, pero el correo no se pudo enviar. Podés reintentar el envío.",
    };
  },

  async deliverEmail(invitationId: string, rawToken: string): Promise<{
    sent: boolean;
    publicErrorCode: string | null;
  }> {
    try {
      const invitation = await userInvitationRepository.findById(invitationId);
      if (!invitation || invitation.status !== "PENDING") {
        return { sent: false, publicErrorCode: "INVITATION_NOT_FOUND" };
      }
      const company = await companyRepository.findById(invitation.companyId);
      if (!company) {
        return { sent: false, publicErrorCode: "COMPANY_NOT_FOUND" };
      }
      const existingUser = await userRepository.findByEmail(invitation.emailNormalized);
      return sendInvitationEmailSafe({
        invitation,
        companyName: company.name,
        rawToken,
        userExists: Boolean(existingUser),
      });
    } catch (error) {
      console.error("[invitation-deliver-email]", {
        invitationId,
        code: "EMAIL_DELIVERY_FAILED",
        detail: error instanceof Error ? error.message : "unknown",
      });
      return { sent: false, publicErrorCode: "EMAIL_DELIVERY_FAILED" };
    }
  },

  async list(
    companyId: string,
    query: { page: number; limit: number; status?: UserInvitationStatus },
  ) {
    const company = await companyRepository.findById(companyId);
    if (!company || company.status !== "ACTIVE") {
      throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
    }

    const offset = (query.page - 1) * query.limit;
    const result = await userInvitationRepository.listByCompany(companyId, {
      status: query.status,
      limit: query.limit,
      offset,
    });

    return {
      data: result.items.map((item) => ({
        id: item.id,
        email: item.emailNormalized,
        inviteeName: item.inviteeName,
        role: item.role,
        status: item.status,
        origin: item.origin,
        expiresAt: item.expiresAt,
        acceptedAt: item.acceptedAt,
        revokedAt: item.revokedAt,
        lastEmailAttemptAt: item.lastEmailSentAt,
        deliveryStatus: resolveInvitationDeliveryStatus(item),
        publicErrorCode:
          item.lastEmailErrorCode === "EMAIL_SEND_IN_PROGRESS"
            ? null
            : item.lastEmailErrorCode,
        createdAt: item.createdAt,
        targetUserId: item.targetUserId,
      })),
      meta: buildPaginationMeta(query.page, query.limit, result.total),
    };
  },

  async revoke(companyId: string, invitationId: string, actorUserId: string) {
    const invitation = await userInvitationRepository.findById(invitationId);
    if (!invitation || invitation.companyId !== companyId) {
      throw new AppError(404, "INVITATION_NOT_FOUND", "Invitación no encontrada.");
    }

    if (invitation.status !== "PENDING") {
      return {
        data: invitation,
        message: `La invitación ya está en estado ${invitation.status}.`,
      };
    }

    const revoked = await userInvitationRepository.revokePending(invitationId);
    await logAuditSafe("user_invitation.revoked", () =>
      auditService.log(companyId, {
        entityType: "user_invitation",
        entityId: invitationId,
        action: "invitation_revoked",
        userId: actorUserId,
      }),
    );

    return {
      data: revoked ?? invitation,
      message: "Invitación revocada.",
    };
  },

  async resend(companyId: string, invitationId: string, actorUserId: string) {
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let invitation: UserInvitation;
    let rawToken: string | null = null;
    let skippedInProgress = false;

    try {
      const locked = await userInvitationRepository.findByIdForUpdate(invitationId, transaction);
      if (!locked || locked.companyId !== companyId) {
        throw new AppError(404, "INVITATION_NOT_FOUND", "Invitación no encontrada.");
      }

      if (locked.status !== "PENDING") {
        throw new AppError(
          409,
          "INVITATION_NOT_PENDING",
          "Solo se pueden reenviar invitaciones pendientes.",
        );
      }

      if (locked.lastEmailErrorCode === "EMAIL_SEND_IN_PROGRESS") {
        invitation = locked;
        skippedInProgress = true;
      } else {
        if (locked.targetUserId) {
          const membership = await userCompanyMembershipRepository.findMembership(
            locked.targetUserId,
            companyId,
            transaction,
          );
          if (membership?.status === "ACTIVE") {
            throw new AppError(
              409,
              "MEMBERSHIP_ALREADY_EXISTS",
              "El usuario ya tiene acceso activo a esta empresa.",
            );
          }
        }

        rawToken = generateInvitationToken();
        const tokenHash = hashInvitationToken(rawToken);
        const replaced = await userInvitationRepository.replaceTokenIfVersion(
          locked.id,
          locked.tokenVersion,
          tokenHash,
          invitationExpiresAt(),
          "RESEND",
          transaction,
        );
        if (!replaced) {
          throw new AppError(
            409,
            "INVITATION_CONFLICT",
            "Otro reenvío está en curso o la invitación cambió. Reintentá.",
          );
        }
        invitation = replaced;
      }

      await transaction.commit();
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore
      }
      throw error;
    }

    if (skippedInProgress || !rawToken) {
      return {
        invitation,
        emailSent: false,
        publicErrorCode: "EMAIL_SEND_IN_PROGRESS",
        reusedPending: true,
        message: "Ya hay un reenvío en curso. Esperá un momento antes de reintentar.",
      };
    }

    await logAuditSafe("user_invitation.resent", () =>
      auditService.log(companyId, {
        entityType: "user_invitation",
        entityId: invitation.id,
        action: "invitation_resent",
        newData: {
          emailMasked: maskEmail(invitation.emailNormalized),
          tokenVersion: invitation.tokenVersion,
        },
        userId: actorUserId,
      }),
    );

    const company = await companyRepository.findById(companyId);
    const existingUser = await userRepository.findByEmail(invitation.emailNormalized);
    const emailResult = await sendInvitationEmailSafe({
      invitation,
      companyName: company?.name ?? "",
      rawToken,
      userExists: Boolean(existingUser),
    });

    return {
      invitation,
      emailSent: emailResult.sent,
      publicErrorCode: emailResult.publicErrorCode,
      reusedPending: true,
      message: emailResult.sent
        ? "Invitación reenviada. El enlace anterior quedó invalidado."
        : "Invitación actualizada, pero el correo no se pudo enviar. Podés reintentar el envío.",
    };
  },

  async preview(rawToken: string): Promise<UserInvitationPublicPreview> {
    const tokenHash = hashInvitationToken(rawToken.trim());
    const invitation = await userInvitationRepository.findByTokenHash(tokenHash);

    const invalid = (): UserInvitationPublicPreview => ({
      companyName: "",
      email: "",
      emailMasked: "",
      role: "",
      status: "INVALID",
      expiresAt: "",
      userExists: false,
      inviteeName: null,
      origin: "MANUAL",
    });

    if (!invitation) {
      return invalid();
    }

    if (invitation.status !== "PENDING") {
      return invalid();
    }

    if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
      await userInvitationRepository.markExpiredIfPending(invitation.id);
      await logAuditSafe("user_invitation.expired", () =>
        auditService.log(invitation.companyId, {
          entityType: "user_invitation",
          entityId: invitation.id,
          action: "invitation_expired",
        }),
      );
      return invalid();
    }

    const company = await companyRepository.findById(invitation.companyId);
    if (!company || company.status !== "ACTIVE") {
      return invalid();
    }

    const existingUser = await userRepository.findByEmail(invitation.emailNormalized);

    return {
      companyName: company.name,
      email: invitation.emailNormalized,
      emailMasked: maskEmail(invitation.emailNormalized),
      role: invitation.role,
      status: "PENDING",
      expiresAt: invitation.expiresAt,
      userExists: Boolean(existingUser),
      inviteeName: invitation.inviteeName,
      origin: invitation.origin,
    };
  },

  async accept(input: {
    rawToken: string;
    authenticatedUserId?: string | null;
    newUser?: {
      name: string;
      password: string;
      passwordConfirmation: string;
    };
  }) {
    const tokenHash = hashInvitationToken(input.rawToken.trim());
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const invitation = await userInvitationRepository.findByTokenHashForUpdate(
        tokenHash,
        transaction,
      );

      if (!invitation || invitation.status !== "PENDING") {
        if (invitation) {
          await logAuditSafe("user_invitation.accept_rejected", () =>
            auditService.log(invitation.companyId, {
              entityType: "user_invitation",
              entityId: invitation.id,
              action: "invitation_accept_rejected",
              newData: { reason: "INVITATION_INVALID" },
            }),
          );
        }
        throw new AppError(
          404,
          "INVITATION_INVALID",
          "La invitación no es válida o ya no está disponible.",
        );
      }

      await logAuditSafe("user_invitation.accept_started", () =>
        auditService.log(invitation.companyId, {
          entityType: "user_invitation",
          entityId: invitation.id,
          action: "invitation_accept_started",
        }),
      );

      if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
        await logAuditSafe("user_invitation.expired", () =>
          auditService.log(invitation.companyId, {
            entityType: "user_invitation",
            entityId: invitation.id,
            action: "invitation_expired",
          }),
        );
        throw new AppError(410, "INVITATION_EXPIRED", "La invitación venció.");
      }

      const company = await companyRepository.findById(invitation.companyId, transaction);
      if (!company || company.status !== "ACTIVE") {
        throw new AppError(404, "COMPANY_NOT_FOUND", "Empresa no encontrada.");
      }

      let user = await userRepository.findByEmail(invitation.emailNormalized, transaction);
      const isNewUser = !user;

      if (isNewUser) {
        if (!input.newUser) {
          throw new AppError(
            400,
            "REGISTRATION_REQUIRED",
            "Debés completar el alta y definir una contraseña para aceptar la invitación.",
          );
        }
        if (input.newUser.password !== input.newUser.passwordConfirmation) {
          throw new AppError(
            400,
            "PASSWORD_MISMATCH",
            "La confirmación de contraseña no coincide.",
          );
        }
        assertPasswordPolicy(input.newUser.password);

        const passwordHash = await hashPassword(input.newUser.password);
        const name =
          input.newUser.name.trim() ||
          invitation.inviteeName?.trim() ||
          invitation.emailNormalized.split("@")[0] ||
          "Usuario";

        user = await userRepository.create(
          {
            name,
            email: invitation.emailNormalized,
            passwordHash,
            role: "ADMIN",
          },
          transaction,
        );
      } else {
        const existingUser = user!;
        if (!input.authenticatedUserId) {
          throw new AppError(
            401,
            "AUTHENTICATION_REQUIRED",
            "Iniciá sesión con la cuenta invitada para aceptar.",
          );
        }
        if (input.authenticatedUserId !== existingUser.id) {
          await logAuditSafe("user_invitation.identity_mismatch", () =>
            auditService.log(invitation.companyId, {
              entityType: "user_invitation",
              entityId: invitation.id,
              action: "invitation_identity_mismatch",
              userId: input.authenticatedUserId ?? null,
            }),
          );
          throw new AppError(
            403,
            "INVITATION_EMAIL_MISMATCH",
            "La sesión actual no corresponde al destinatario de la invitación.",
          );
        }
        user = existingUser;
      }

      if (!user) {
        throw new AppError(500, "USER_RESOLVE_FAILED", "No se pudo resolver el usuario.");
      }

      const resolvedUser = user;

      const existingMembership = await userCompanyMembershipRepository.findMembership(
        resolvedUser.id,
        invitation.companyId,
        transaction,
      );

      if (existingMembership?.status === "ACTIVE") {
        const accepted = await userInvitationRepository.markAcceptedIfPending(
          invitation.id,
          transaction,
        );
        await transaction.commit();
        return {
          data: {
            companyId: invitation.companyId,
            companyName: company.name,
            userId: resolvedUser.id,
            email: invitation.emailNormalized,
            role: existingMembership.role,
            alreadyMember: true,
          },
          message: "Ya tenías acceso a esta empresa.",
          invitationAccepted: Boolean(accepted),
        };
      }

      const shouldSetDefault = !(await userCompanyMembershipRepository.userHasDefaultMembership(
        resolvedUser.id,
        transaction,
      ));

      let membership = existingMembership;
      if (existingMembership) {
        membership = await userCompanyMembershipRepository.updateMembership(
          invitation.companyId,
          resolvedUser.id,
          {
            role: invitation.role as CompanyRole,
            status: "ACTIVE",
            isDefault: shouldSetDefault,
          },
          transaction,
        );
      } else {
        membership = await userCompanyMembershipRepository.create(
          {
            userId: resolvedUser.id,
            companyId: invitation.companyId,
            role: invitation.role as CompanyRole,
            status: "ACTIVE",
            isDefault: shouldSetDefault,
          },
          transaction,
        );
      }

      if (!membership) {
        throw new AppError(500, "MEMBERSHIP_UPDATE_FAILED", "No se pudo crear la membresía.");
      }

      if (shouldSetDefault) {
        await userCompanyMembershipRepository.clearDefaultForUser(
          resolvedUser.id,
          invitation.companyId,
          transaction,
        );
      }

      const accepted = await userInvitationRepository.markAcceptedIfPending(
        invitation.id,
        transaction,
      );
      if (!accepted) {
        await logAuditSafe("user_invitation.concurrency_conflict", () =>
          auditService.log(invitation.companyId, {
            entityType: "user_invitation",
            entityId: invitation.id,
            action: "invitation_concurrency_conflict",
            userId: resolvedUser.id,
          }),
        );
        throw new AppError(
          409,
          "INVITATION_ALREADY_ACCEPTED",
          "La invitación ya fue aceptada.",
        );
      }

      await transaction.commit();

      await logAuditSafe("user_invitation.accepted", () =>
        auditService.log(invitation.companyId, {
          entityType: "user_invitation",
          entityId: invitation.id,
          action: "invitation_accepted",
          newData: {
            userId: resolvedUser.id,
            role: membership.role,
            isNewUser,
          },
          userId: resolvedUser.id,
        }),
      );

      return {
        data: {
          companyId: invitation.companyId,
          companyName: company.name,
          userId: resolvedUser.id,
          email: invitation.emailNormalized,
          role: membership.role,
          alreadyMember: false,
          isNewUser,
        },
        message: isNewUser
          ? "Cuenta creada e invitación aceptada."
          : "Invitación aceptada. Ya tenés acceso a la empresa.",
        invitationAccepted: true,
      };
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore secondary rollback errors
      }
      throw error;
    }
  },

  /**
   * Invitee declines a pending invitation.
   * Existing users must be authenticated as the invitee; new users may decline with the token alone.
   */
  async decline(input: {
    rawToken: string;
    authenticatedUserId?: string | null;
  }) {
    const tokenHash = hashInvitationToken(input.rawToken.trim());
    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const invitation = await userInvitationRepository.findByTokenHashForUpdate(
        tokenHash,
        transaction,
      );

      if (!invitation || invitation.status !== "PENDING") {
        throw new AppError(
          404,
          "INVITATION_INVALID",
          "La invitación no es válida o ya no está disponible.",
        );
      }

      if (new Date(invitation.expiresAt).getTime() <= Date.now()) {
        throw new AppError(410, "INVITATION_EXPIRED", "La invitación venció.");
      }

      const existingUser = await userRepository.findByEmail(
        invitation.emailNormalized,
        transaction,
      );

      if (existingUser) {
        if (!input.authenticatedUserId) {
          throw new AppError(
            401,
            "AUTHENTICATION_REQUIRED",
            "Iniciá sesión con la cuenta invitada para rechazar la invitación.",
          );
        }
        if (input.authenticatedUserId !== existingUser.id) {
          await logAuditSafe("user_invitation.identity_mismatch", () =>
            auditService.log(invitation.companyId, {
              entityType: "user_invitation",
              entityId: invitation.id,
              action: "invitation_identity_mismatch",
              newData: { operation: "decline" },
              userId: input.authenticatedUserId ?? null,
            }),
          );
          throw new AppError(
            403,
            "INVITATION_EMAIL_MISMATCH",
            "La sesión actual no corresponde al destinatario de la invitación.",
          );
        }
      }

      const declined = await userInvitationRepository.markDeclinedIfPending(
        invitation.id,
        transaction,
      );
      if (!declined) {
        throw new AppError(
          409,
          "INVITATION_ALREADY_RESOLVED",
          "La invitación ya no está pendiente.",
        );
      }

      await transaction.commit();

      await logAuditSafe("user_invitation.declined", () =>
        auditService.log(invitation.companyId, {
          entityType: "user_invitation",
          entityId: invitation.id,
          action: "invitation_declined",
          newData: {
            emailMasked: maskEmail(invitation.emailNormalized),
            userExists: Boolean(existingUser),
          },
          userId: existingUser?.id ?? input.authenticatedUserId ?? null,
        }),
      );

      return {
        data: {
          companyId: invitation.companyId,
          status: declined.status,
          declined: true,
        },
        message: "Invitación rechazada.",
      };
    } catch (error) {
      try {
        await transaction.rollback();
      } catch {
        // ignore
      }
      throw error;
    }
  },
};
