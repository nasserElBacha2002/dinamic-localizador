import type { Request, Response } from "express";
import { storeService } from "../services/store.service";

export const storeController = {
  async create(req: Request, res: Response) {
    const store = await storeService.create(req.body);
    res.status(201).json({ data: store });
  },

  async list(req: Request, res: Response) {
    const result = await storeService.list(req.validatedQuery as never);
    res.status(200).json(result);
  },

  async getById(req: Request, res: Response) {
    const store = await storeService.getById(String(req.params.id));
    res.status(200).json({ data: store });
  },

  async update(req: Request, res: Response) {
    const store = await storeService.update(String(req.params.id), req.body);
    res.status(200).json({ data: store });
  },

  async deactivate(req: Request, res: Response) {
    const store = await storeService.deactivate(String(req.params.id));
    res.status(200).json({ data: store });
  },
};
