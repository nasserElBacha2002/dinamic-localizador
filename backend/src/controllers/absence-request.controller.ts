import type { Request, Response } from "express";
import { absenceRequestService } from "../services/absence-request.service";
import { absenceReviewService } from "../services/absence-review.service";
import { absenceTypeRepository } from "../repositories/absence-type.repository";

export const absenceRequestController = {
  async listTypes(req: Request, res: Response) {
    const query = req.validatedQuery as { activeOnly: boolean };
    const types = await absenceTypeRepository.listAll(query.activeOnly);
    res.status(200).json({ data: types });
  },

  async list(req: Request, res: Response) {
    const result = await absenceRequestService.list(req.validatedQuery as never);
    res.status(200).json(result);
  },

  async getById(req: Request, res: Response) {
    const request = await absenceRequestService.getById(String(req.params.id));
    res.status(200).json({ data: request });
  },

  async create(req: Request, res: Response) {
    const request = await absenceRequestService.createFromAdmin(
      req.body,
      req.auth!.userId,
    );
    res.status(201).json({ data: request });
  },

  async approve(req: Request, res: Response) {
    const request = await absenceReviewService.approve(String(req.params.id), req.auth!.userId);
    res.status(200).json({ data: request });
  },

  async reject(req: Request, res: Response) {
    const request = await absenceReviewService.reject(
      String(req.params.id),
      req.auth!.userId,
      req.body,
    );
    res.status(200).json({ data: request });
  },

  async needsInfo(req: Request, res: Response) {
    const request = await absenceReviewService.needsInfo(
      String(req.params.id),
      req.auth!.userId,
      req.body,
    );
    res.status(200).json({ data: request });
  },

  async cancel(req: Request, res: Response) {
    const request = await absenceReviewService.cancel(String(req.params.id), req.auth!.userId);
    res.status(200).json({ data: request });
  },
};
