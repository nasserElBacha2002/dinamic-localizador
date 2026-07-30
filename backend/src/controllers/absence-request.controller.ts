import type { Request, Response } from "express";
import { absenceRequestService } from "../services/absence-request.service";
import { absenceReviewService } from "../services/absence-review.service";
import { absenceOperationImpactService } from "../services/absence-operation-impact.service";
import { absenceOperationalImpactRepository } from "../repositories/absence-operational-impact.repository";
import { absenceTypeRepository } from "../repositories/absence-type.repository";
import type { ResolveAbsenceOperationalConflictInput } from "../schemas/absence-request.schema";
import { requireRequestCompanyId } from "../utils/request-company";

export const absenceRequestController = {
  async listTypes(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const query = req.validatedQuery as { activeOnly: boolean };
    const types = await absenceTypeRepository.listAll(companyId, query.activeOnly);
    res.status(200).json({ data: types });
  },

  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await absenceRequestService.list(companyId, req.validatedQuery as never);
    res.status(200).json(result);
  },

  async getById(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const request = await absenceRequestService.getById(companyId, String(req.params.id));
    res.status(200).json({ data: request });
  },

  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const request = await absenceRequestService.createFromAdmin(
      companyId,
      req.body,
      req.auth!.userId,
    );
    res.status(201).json({ data: request });
  },

  async approve(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const request = await absenceReviewService.approve(
      companyId,
      String(req.params.id),
      req.auth!.userId,
    );
    res.status(200).json({ data: request });
  },

  async reject(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const request = await absenceReviewService.reject(
      companyId,
      String(req.params.id),
      req.auth!.userId,
      req.body,
    );
    res.status(200).json({ data: request });
  },

  async needsInfo(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const request = await absenceReviewService.needsInfo(
      companyId,
      String(req.params.id),
      req.auth!.userId,
      req.body,
    );
    res.status(200).json({ data: request });
  },

  async cancel(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const request = await absenceReviewService.cancel(
      companyId,
      String(req.params.id),
      req.auth!.userId,
    );
    res.status(200).json({ data: request });
  },

  async updateNeedsInfo(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const request = await absenceRequestService.updateNeedsInfo(
      companyId,
      String(req.params.id),
      req.body,
      req.auth!.userId,
    );
    res.status(200).json({ data: request });
  },

  async resubmit(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const request = await absenceRequestService.resubmit(
      companyId,
      String(req.params.id),
      req.auth!.userId,
    );
    res.status(200).json({ data: request });
  },

  async getOperationalImpact(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const impact = await absenceOperationImpactService.computeImpact(
      companyId,
      String(req.params.id),
    );
    res.status(200).json({ data: impact });
  },

  async listOperationalConflicts(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const conflicts = await absenceOperationalImpactRepository.listConflictsByRequest(
      companyId,
      String(req.params.id),
    );
    res.status(200).json({ data: conflicts });
  },

  async resolveOperationalConflict(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const body = req.body as ResolveAbsenceOperationalConflictInput;
    const conflict = await absenceOperationImpactService.resolveConflict(
      companyId,
      String(req.params.id),
      String(req.params.conflictId),
      {
        resolutionCode: body.resolutionCode,
        resolutionReason: body.resolutionReason,
        replacementEmployeeId: body.replacementEmployeeId,
        commandId: body.commandId,
        resolvedByUserId: req.auth!.userId,
      },
    );
    res.status(200).json({ data: conflict });
  },

  async reconcileOperationalImpact(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const accepted = await absenceOperationImpactService.reconcileManually(
      companyId,
      String(req.params.id),
      req.auth!.userId,
    );
    res.status(202).json({ data: accepted });
  },
};
