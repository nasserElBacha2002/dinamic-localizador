import { Router } from "express";
import { workTeamController } from "../controllers/work-team.controller";
import { asyncHandler } from "../middleware/async-handler";
import { requirePermission } from "../middleware/company-context";
import { validate } from "../middleware/validate";
import {
  addWorkTeamMembersSchema,
  createWorkTeamSchema,
  listWorkTeamUsageQuerySchema,
  listWorkTeamsQuerySchema,
  replaceWorkTeamMembersSchema,
  updateWorkTeamSchema,
  workTeamIdParamSchema,
  workTeamMemberParamsSchema,
} from "../schemas/work-team.schema";

export const workTeamRouter = Router();

workTeamRouter.post(
  "/",
  requirePermission("employees:manage"),
  validate(createWorkTeamSchema),
  asyncHandler(workTeamController.create),
);
workTeamRouter.get(
  "/",
  requirePermission("employees:read"),
  validate(listWorkTeamsQuerySchema, "query"),
  asyncHandler(workTeamController.list),
);
workTeamRouter.get(
  "/:workTeamId",
  requirePermission("employees:read"),
  validate(workTeamIdParamSchema, "params"),
  asyncHandler(workTeamController.getById),
);
workTeamRouter.patch(
  "/:workTeamId",
  requirePermission("employees:manage"),
  validate(workTeamIdParamSchema, "params"),
  validate(updateWorkTeamSchema),
  asyncHandler(workTeamController.update),
);
workTeamRouter.post(
  "/:workTeamId/activate",
  requirePermission("employees:manage"),
  validate(workTeamIdParamSchema, "params"),
  asyncHandler(workTeamController.activate),
);
workTeamRouter.post(
  "/:workTeamId/deactivate",
  requirePermission("employees:manage"),
  validate(workTeamIdParamSchema, "params"),
  asyncHandler(workTeamController.deactivate),
);
workTeamRouter.get(
  "/:workTeamId/members",
  requirePermission("employees:read"),
  validate(workTeamIdParamSchema, "params"),
  asyncHandler(workTeamController.listMembers),
);
workTeamRouter.post(
  "/:workTeamId/members",
  requirePermission("employees:manage"),
  validate(workTeamIdParamSchema, "params"),
  validate(addWorkTeamMembersSchema),
  asyncHandler(workTeamController.addMembers),
);
workTeamRouter.put(
  "/:workTeamId/members",
  requirePermission("employees:manage"),
  validate(workTeamIdParamSchema, "params"),
  validate(replaceWorkTeamMembersSchema),
  asyncHandler(workTeamController.replaceMembers),
);
workTeamRouter.delete(
  "/:workTeamId/members/:employeeId",
  requirePermission("employees:manage"),
  validate(workTeamMemberParamsSchema, "params"),
  asyncHandler(workTeamController.removeMember),
);
workTeamRouter.get(
  "/:workTeamId/usage",
  requirePermission("employees:read"),
  validate(workTeamIdParamSchema, "params"),
  validate(listWorkTeamUsageQuerySchema, "query"),
  asyncHandler(workTeamController.listUsage),
);
