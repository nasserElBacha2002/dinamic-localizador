import type { Request, Response } from "express";
import { workTeamService } from "../services/work-team.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const workTeamController = {
  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const team = await workTeamService.create(companyId, req.auth?.userId ?? null, req.body);
    res.status(201).json({ data: team });
  },

  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await workTeamService.list(companyId, req.validatedQuery as never);
    res.status(200).json(result);
  },

  async getById(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const team = await workTeamService.getById(companyId, String(req.params.workTeamId));
    res.status(200).json({ data: team });
  },

  async update(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const team = await workTeamService.update(
      companyId,
      String(req.params.workTeamId),
      req.auth?.userId ?? null,
      req.body,
    );
    res.status(200).json({ data: team });
  },

  async activate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const team = await workTeamService.activate(
      companyId,
      String(req.params.workTeamId),
      req.auth?.userId ?? null,
    );
    res.status(200).json({ data: team });
  },

  async deactivate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const team = await workTeamService.deactivate(
      companyId,
      String(req.params.workTeamId),
      req.auth?.userId ?? null,
    );
    res.status(200).json({ data: team });
  },

  async listMembers(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await workTeamService.listMembers(companyId, String(req.params.workTeamId));
    res.status(200).json(result);
  },

  async addMembers(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await workTeamService.addMembers(
      companyId,
      String(req.params.workTeamId),
      req.auth?.userId ?? null,
      req.body,
    );
    res.status(200).json(result);
  },

  async replaceMembers(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await workTeamService.replaceMembers(
      companyId,
      String(req.params.workTeamId),
      req.auth?.userId ?? null,
      req.body,
    );
    res.status(200).json(result);
  },

  async removeMember(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await workTeamService.removeMember(
      companyId,
      String(req.params.workTeamId),
      String(req.params.employeeId),
      req.auth?.userId ?? null,
    );
    res.status(200).json(result);
  },

  async listUsage(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await workTeamService.listUsage(
      companyId,
      String(req.params.workTeamId),
      req.validatedQuery as never,
    );
    res.status(200).json(result);
  },
};
