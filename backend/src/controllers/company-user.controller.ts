import type { Request, Response } from "express";
import { companyUserService } from "../services/company-user.service";
import { requireRequestCompanyId } from "../utils/request-company";

const readCorrelationId = (req: Request): string | null => {
  const header = req.header("x-request-id") ?? req.header("x-correlation-id");
  const value = header?.trim();
  return value ? value.slice(0, 128) : null;
};

export const companyUserController = {
  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await companyUserService.list(
      companyId,
      req.validatedQuery as never,
      Boolean(req.isPlatformAdmin),
    );
    res.status(200).json(result);
  },

  async getById(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const user = await companyUserService.getById(
      companyId,
      String(req.params.userId),
      Boolean(req.isPlatformAdmin),
    );
    res.status(200).json({ data: user });
  },

  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await companyUserService.create(
      companyId,
      req.body,
      req.auth!.userId,
      Boolean(req.isPlatformAdmin),
      req.companyRole,
    );
    res.status(201).json(result);
  },

  async update(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const user = await companyUserService.update(
      companyId,
      String(req.params.userId),
      req.body,
      req.auth!.userId,
      Boolean(req.isPlatformAdmin),
      req.companyRole,
      readCorrelationId(req),
    );
    res.status(200).json({ data: user });
  },

  async deactivate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const user = await companyUserService.deactivate(
      companyId,
      String(req.params.userId),
      req.auth!.userId,
      Boolean(req.isPlatformAdmin),
      req.companyRole,
      readCorrelationId(req),
    );
    res.status(200).json({ data: user });
  },
};
