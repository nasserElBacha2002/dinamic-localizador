import type { Request, Response } from "express";
import { operationImportService } from "../services/operation-import.service";
import type { OperationImportConfirmInput, OperationImportPreviewInput } from "../schemas/operation-import.schema";
import { requireRequestCompanyId } from "../utils/request-company";

export const operationImportController = {
  async preview(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const body = req.body as OperationImportPreviewInput;

    if ("fileContentBase64" in body && body.fileName) {
      const buffer = Buffer.from(body.fileContentBase64, "base64");
      const result = await operationImportService.previewFile(companyId, buffer, body.fileName);
      res.status(200).json({ data: result });
      return;
    }

    const { csv } = body as { csv: string };
    const result = await operationImportService.previewFile(
      companyId,
      Buffer.from(csv, "utf8"),
      "upload.csv",
    );
    res.status(200).json({ data: result });
  },

  async confirm(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const body = req.body as OperationImportConfirmInput;
    const rows = body.rows.map((row) => ({
      ...row,
      notes: row.notes ?? null,
    }));
    const result = await operationImportService.confirm(companyId, rows);
    res.status(201).json(result);
  },
};
