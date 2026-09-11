import type { Request, Response } from "express";
import { systemLogsService } from "../services/system-logs.service";
import type { SystemLogsListQuery } from "../schemas/system-logs.schema";

export const systemLogsController = {
  list: async (req: Request, res: Response): Promise<void> => {
    const result = await systemLogsService.list(req.query as unknown as SystemLogsListQuery);
    res.status(200).json(result);
  },

  getById: async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const userId = req.auth!.userId;
    const row = await systemLogsService.getById(id, userId);
    res.status(200).json({ data: row });
  },

  getContext: async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params.id);
    const userId = req.auth!.userId;
    const result = await systemLogsService.getContext(id, userId);
    res.status(200).json(result);
  },

  options: async (_req: Request, res: Response): Promise<void> => {
    res.status(200).json({ data: systemLogsService.getOptions() });
  },
};
