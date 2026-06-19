import type { Request, Response } from "express";
import { inventoryService } from "../services/inventory.service";

export const inventoryController = {
  async create(req: Request, res: Response) {
    const inventory = await inventoryService.create(req.body);
    res.status(201).json({ data: inventory });
  },

  async list(req: Request, res: Response) {
    const result = await inventoryService.list(req.validatedQuery as never);
    res.status(200).json(result);
  },

  async getById(req: Request, res: Response) {
    const inventory = await inventoryService.getDetailById(String(req.params.id));
    res.status(200).json({ data: inventory });
  },

  async update(req: Request, res: Response) {
    const inventory = await inventoryService.update(String(req.params.id), req.body);
    res.status(200).json({ data: inventory });
  },

  async cancel(req: Request, res: Response) {
    const inventory = await inventoryService.cancel(String(req.params.id));
    res.status(200).json({ data: inventory });
  },

  async getAttendanceSummary(req: Request, res: Response) {
    const query = req.validatedQuery as { page: number; limit: number };
    const summary = await inventoryService.getAttendanceSummary(
      String(req.params.id),
      query.page,
      query.limit,
    );
    res.status(200).json({ data: summary });
  },
};
