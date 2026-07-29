import type { Request, Response } from "express";
import { userInvitationService } from "../services/user-invitation.service";
import { requireRequestCompanyId } from "../utils/request-company";
import type { AcceptInvitationInput, CreateInvitationInput, DeclineInvitationInput } from "../schemas/user-invitation.schema";
import type { CompanyRole } from "../types/company";

export const userInvitationController = {
  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await userInvitationService.list(companyId, req.validatedQuery as never);
    res.status(200).json(result);
  },

  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const body = req.body as CreateInvitationInput;
    const actorRole = req.companyRole as CompanyRole | undefined;
    const canAssignOwner = Boolean(req.isPlatformAdmin) || actorRole === "OWNER";

    const result = await userInvitationService.issueInvitation({
      companyId,
      email: body.email,
      role: body.role,
      inviteeName: body.name ?? null,
      invitedByUserId: req.auth!.userId,
      origin: "MANUAL",
      canAssignOwner,
    });

    res.status(201).json({
      data: {
        id: result.invitation.id,
        email: result.invitation.emailNormalized,
        role: result.invitation.role,
        status: result.invitation.status,
        expiresAt: result.invitation.expiresAt,
        emailSent: result.emailSent,
      },
      message: result.message,
    });
  },

  async resend(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await userInvitationService.resend(
      companyId,
      String(req.params.invitationId),
      req.auth!.userId,
    );
    res.status(200).json({
      data: {
        id: result.invitation.id,
        email: result.invitation.emailNormalized,
        status: result.invitation.status,
        expiresAt: result.invitation.expiresAt,
        emailSent: result.emailSent,
      },
      message: result.message,
    });
  },

  async revoke(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await userInvitationService.revoke(
      companyId,
      String(req.params.invitationId),
      req.auth!.userId,
    );
    res.status(200).json(result);
  },

  async preview(req: Request, res: Response) {
    const token = String((req.validatedQuery as { token: string }).token);
    const preview = await userInvitationService.preview(token);
    res.status(200).json({ data: preview });
  },

  async accept(req: Request, res: Response) {
    const body = req.body as AcceptInvitationInput;
    const result = await userInvitationService.accept({
      rawToken: body.token,
      authenticatedUserId: req.auth?.userId ?? null,
      newUser:
        body.password && body.passwordConfirmation
          ? {
              name: body.name?.trim() || "",
              password: body.password,
              passwordConfirmation: body.passwordConfirmation,
            }
          : undefined,
    });
    res.status(200).json(result);
  },

  async decline(req: Request, res: Response) {
    const body = req.body as DeclineInvitationInput;
    const result = await userInvitationService.decline({
      rawToken: body.token,
      authenticatedUserId: req.auth?.userId ?? null,
    });
    res.status(200).json(result);
  },
};
