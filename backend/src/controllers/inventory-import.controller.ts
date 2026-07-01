import type { Request, Response } from "express";
import { inventoryImportService } from "../services/inventory-import.service";
import type { InventoryImportConfirmInput, InventoryImportPreviewInput } from "../schemas/inventory-import.schema";
import { requireRequestCompanyId } from "../utils/request-company";

export const inventoryImportController = {
  async preview(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const body = req.body as InventoryImportPreviewInput;

    if ("fileContentBase64" in body && body.fileName) {
      const buffer = Buffer.from(body.fileContentBase64, "base64");
      const result = await inventoryImportService.previewFile(companyId, buffer, body.fileName);
      res.status(200).json({ data: result });
      return;
    }

    const { csv } = body as { csv: string };
    const result = await inventoryImportService.previewFile(
      companyId,
      Buffer.from(csv, "utf8"),
      "upload.csv",
    );
    res.status(200).json({ data: result });
  },

  async confirm(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const body = req.body as InventoryImportConfirmInput;
    const rows = body.rows.map((row) => ({
      ...row,
      notes: row.notes ?? null,
    }));
    const result = await inventoryImportService.confirm(companyId, rows);
    res.status(201).json(result);
  },
};
