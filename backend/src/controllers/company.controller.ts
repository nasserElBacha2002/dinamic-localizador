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

  async getWorkSchedule(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const schedule = await companyService.getWorkSchedule(companyId);
    res.status(200).json({ data: schedule });
  },

  async updateWorkSchedule(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const schedule = await companyService.updateWorkSchedule(
      companyId,
      req.companyRole!,
      req.body,
    );
    res.status(200).json({ data: schedule });
  },

  async getAbsenceSettings(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const settings = await companyService.getAbsenceSettings(companyId);
    res.status(200).json({ data: settings });
  },

  async updateAbsenceSettings(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const settings = await companyService.updateAbsenceSettings(
      companyId,
      req.companyRole!,
      req.body,
    );
    res.status(200).json({ data: settings });
  },

  async listLocationTypes(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const activeOnly = req.query.activeOnly === "true";
    const locationTypes = await companyService.listLocationTypes(companyId, activeOnly);
    res.status(200).json({ data: locationTypes });
  },

  async createLocationType(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const locationType = await companyService.createLocationType(
      companyId,
      req.companyRole!,
      req.body,
    );
    res.status(201).json({ data: locationType });
  },

  async updateLocationType(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const locationType = await companyService.updateLocationType(
      companyId,
      req.companyRole!,
      String(req.params.locationTypeId),
      req.body,
    );
    res.status(200).json({ data: locationType });
  },

  async disableLocationType(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const locationType = await companyService.disableLocationType(
      companyId,
      req.companyRole!,
      String(req.params.locationTypeId),
    );
    res.status(200).json({ data: locationType });
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
      Boolean(req.isPlatformAdmin),
      req.body,
    );
    res.status(200).json({ data: modules });
  },
};
