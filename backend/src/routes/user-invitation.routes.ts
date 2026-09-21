import { Router } from "express";
import { userInvitationController } from "../controllers/user-invitation.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { rateLimitInvitations } from "../middleware/rate-limit-invitations";
import { optionalAuthenticate } from "../middleware/optional-authenticate";
import { validate } from "../middleware/validate";
import {
  acceptInvitationSchema,
  createInvitationSchema,
  declineInvitationSchema,
  invitationIdParamSchema,
  listInvitationsQuerySchema,
  previewInvitationBodySchema,
  previewInvitationQuerySchema,
} from "../schemas/user-invitation.schema";

/** Company-scoped invitation management (authenticated + users:manage). */
export const companyInvitationRouter = Router({ mergeParams: true });

companyInvitationRouter.get(
  "/",
  requirePermission("users:manage"),
  validate(listInvitationsQuerySchema, "query"),
  asyncHandler(userInvitationController.list),
);

companyInvitationRouter.post(
  "/",
  requirePermission("users:manage"),
  rateLimitInvitations({ scope: "invite-create", windowMs: 60_000, max: 20 }),
  validate(createInvitationSchema),
  asyncHandler(userInvitationController.create),
);

companyInvitationRouter.post(
  "/:invitationId/resend",
  requirePermission("users:manage"),
  rateLimitInvitations({ scope: "invite-resend", windowMs: 60_000, max: 10 }),
  validate(invitationIdParamSchema, "params"),
  asyncHandler(userInvitationController.resend),
);

companyInvitationRouter.post(
  "/:invitationId/revoke",
  requirePermission("users:manage"),
  validate(invitationIdParamSchema, "params"),
  asyncHandler(userInvitationController.revoke),
);

/** Public invitation preview/accept (token-based). */
export const publicInvitationRouter = Router();

/** Preferred: token in body (not logged by access logger URL). */
publicInvitationRouter.post(
  "/preview",
  rateLimitInvitations({ scope: "invite-preview", windowMs: 60_000, max: 30 }),
  validate(previewInvitationBodySchema),
  asyncHandler(userInvitationController.preview),
);

/**
 * DEPRECATED — Legacy GET preview (token in query string).
 *
 * Residual risk: email deep-links still put the raw token in the browser URL
 * (`/invitations/accept?token=…`). Prefer POST /preview for API calls so the
 * token is not repeated in subsequent access-log URLs. Access logger redacts
 * `token` via `:safe-url`, but browser history / Referer exposure remains.
 *
 * Removal plan: after all clients use POST-only preview, delete this route in a
 * dedicated deprecation phase. Do not remove while older clients may probe GET.
 */
publicInvitationRouter.get(
  "/preview",
  rateLimitInvitations({ scope: "invite-preview-get", windowMs: 60_000, max: 30 }),
  validate(previewInvitationQuerySchema, "query"),
  asyncHandler(userInvitationController.preview),
);

publicInvitationRouter.post(
  "/accept",
  rateLimitInvitations({ scope: "invite-accept", windowMs: 60_000, max: 20 }),
  optionalAuthenticate,
  validate(acceptInvitationSchema),
  asyncHandler(userInvitationController.accept),
);

publicInvitationRouter.post(
  "/decline",
  rateLimitInvitations({ scope: "invite-decline", windowMs: 60_000, max: 20 }),
  optionalAuthenticate,
  validate(declineInvitationSchema),
  asyncHandler(userInvitationController.decline),
);
