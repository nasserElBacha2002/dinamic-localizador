import type { Request, Response } from "express";
import { marketingDemoLeadService } from "../services/marketing/demo-lead.service";

export const marketingDemoController = {
  async submit(req: Request, res: Response) {
    const result = await marketingDemoLeadService.submit(req.body);
    res.status(200).json({ data: result });
  },
};