import type { Request, Response } from "express";
import { importOrchestrator } from "../imports/orchestrator";
import type { ImportFileBody } from "../schemas/import.schema";
import { requireRequestCompanyId } from "../utils/request-company";

export const importController = {
  async template(req: Request, res: Response) {
    const entityType = String(req.params.entityType);
    const template = importOrchestrator.getTemplate(entityType);
    res.setHeader("Content-Type", template.contentType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${template.fileName.replace(/"/g, "")}"`,
    );
    res.status(200).send(template.body);
  },

  async preview(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const entityType = String(req.params.entityType);
    const body = req.body as ImportFileBody;
    const result = await importOrchestrator.preview(companyId, entityType, body);
    res.status(200).json({ data: result });
  },

  async execute(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const entityType = String(req.params.entityType);
    const body = req.body as ImportFileBody;
    const userId = req.auth?.userId ?? null;
    const result = await importOrchestrator.execute(companyId, entityType, body, userId);
    res.status(201).json({ data: result });
  },
};
