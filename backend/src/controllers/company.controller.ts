import type { Request, Response } from "express";
import { companyModuleService } from "../services/company-module.service";
import { companyService } from "../services/company.service";
import { platformAdminService } from "../services/platform-admin.service";
import { userRepository } from "../repositories/user.repository";
import { requireRequestCompanyId } from "../utils/request-company";

export const companyController = {
  async listForCurrentUser(req: Request, res: Response) {
    const user = await userRepository.findById(req.auth!.userId);
    if (!user) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Usuario no válido." } });
      return;
    }

    const companies = await companyService.listForUser(
      req.auth!.userId,
      platformAdminService.isPlatformAdmin(user),
    );
    res.status(200).json({ data: companies });
  },

  async getSettings(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const settings = await companyService.getSettings(companyId);
    res.status(200).json({ data: settings });
  },

  async updateSettings(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const settings = await companyService.updateSettings(
      companyId,
      req.companyRole!,
      req.body,
    );
    res.status(200).json({ data: settings });
  },

  async getMembership(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    res.status(200).json({
      data: {
        companyId,
        companyName: req.company!.name,
        role: req.companyRole,
        isPlatformAdmin: Boolean(req.isPlatformAdmin),
        permissions: Array.from(req.permissions ?? []),
      },
    });
  },

  async listModules(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const modules = await companyModuleService.listModules(companyId);
    res.status(200).json({ data: modules });
  },

  async updateModules(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const modules = await companyModuleService.updateModules(
      companyId,
      req.companyRole!,
      req.body,
    );
    res.status(200).json({ data: modules });
  },
};
