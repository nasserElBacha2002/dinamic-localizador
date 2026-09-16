import type { Request, Response } from "express";
import { operationScheduleModeTransitionService } from "../services/operation-schedule-mode-transition.service";
import { operationShiftService } from "../services/operation-shift.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const shiftTemplateController = {
  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const activeOnly = Boolean((req.validatedQuery as { activeOnly?: boolean })?.activeOnly);
    const data = await operationShiftService.listTemplates(companyId, activeOnly);
    res.status(200).json({ data });
  },

  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const template = await operationShiftService.createTemplate(companyId, {
      code: req.body.code ?? req.body.name,
      name: req.body.name,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      sortOrder: req.body.sortOrder,
      isActive: req.body.isActive,
    });
    res.status(201).json({ data: template });
  },

  async patch(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const template = await operationShiftService.updateTemplate(
      companyId,
      String(req.params.templateId),
      req.body,
    );
    res.status(200).json({ data: template });
  },

  async deactivate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const template = await operationShiftService.deactivateTemplate(
      companyId,
      String(req.params.templateId),
    );
    res.status(200).json({ data: template });
  },
};

export const operationShiftController = {
  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const activeOnly = Boolean((req.validatedQuery as { activeOnly?: boolean })?.activeOnly);
    const data = await operationShiftService.listOperationShifts(
      companyId,
      String(req.params.operationId),
      activeOnly,
    );
    res.status(200).json({ data });
  },

  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const shift = await operationShiftService.createCustomShift(companyId, {
      operationId: String(req.params.operationId),
      code: req.body.code ?? req.body.name,
      name: req.body.name,
      templateId: req.body.templateId,
      sortOrder: req.body.sortOrder,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      effectiveFrom: req.body.effectiveFrom,
      effectiveUntil: req.body.effectiveUntil,
      days: req.body.days,
      isActive: req.body.isActive,
    });
    res.status(201).json({ data: shift });
  },

  async patch(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const shift = await operationShiftService.updateShiftIdentity(
      companyId,
      String(req.params.shiftId),
      req.body,
    );
    res.status(200).json({ data: shift });
  },

  async deactivate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const shift = await operationShiftService.deactivateShift(
      companyId,
      String(req.params.shiftId),
    );
    res.status(200).json({ data: shift });
  },

  async addVersion(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const version = await operationShiftService.addVersion(
      companyId,
      String(req.params.shiftId),
      req.body,
    );
    res.status(201).json({ data: version });
  },

  async upsertException(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await operationShiftService.upsertDateException(companyId, {
      operationId: String(req.params.operationId),
      operationShiftId: String(req.params.shiftId),
      workDate: req.body.workDate,
      exceptionKind: req.body.exceptionKind,
      startTime: req.body.startTime,
      endTime: req.body.endTime,
      reason: req.body.reason,
      createdByUserId: req.auth?.userId ?? null,
    });
    res.status(200).json({
      data: {
        exception: result.exception,
        workday: result.workday
          ? {
              id: result.workday.id,
              status: result.workday.status,
              cancellationReason: result.workday.cancellationReason,
              workDate: result.workday.workDate,
              operationShiftId: result.workday.operationShiftId,
              expectedStartAt: result.workday.expectedStartAt,
              expectedEndAt: result.workday.expectedEndAt,
            }
          : null,
      },
    });
  },

  async transitionToMultiShift(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await operationScheduleModeTransitionService.transitionToMultiShift(
      companyId,
      String(req.params.operationId),
      req.body,
    );
    res.status(200).json({ data: result });
  },

  async transitionToSingle(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await operationScheduleModeTransitionService.transitionToSingle(
      companyId,
      String(req.params.operationId),
      req.body,
    );
    res.status(200).json({ data: result });
  },
};
