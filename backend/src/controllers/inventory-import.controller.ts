import type { Request, Response } from "express";
import { inventoryImportService } from "../services/inventory-import.service";
import type { InventoryImportConfirmInput, InventoryImportPreviewInput } from "../schemas/inventory-import.schema";

export const inventoryImportController = {
  async preview(req: Request, res: Response) {
    const body = req.body as InventoryImportPreviewInput;

    if ("fileContentBase64" in body && body.fileName) {
      const buffer = Buffer.from(body.fileContentBase64, "base64");
      const result = await inventoryImportService.previewFile(buffer, body.fileName);
      res.status(200).json({ data: result });
      return;
    }

    const { csv } = body as { csv: string };
    const result = await inventoryImportService.previewFile(Buffer.from(csv, "utf8"), "upload.csv");
    res.status(200).json({ data: result });
  },

  async confirm(req: Request, res: Response) {
    const body = req.body as InventoryImportConfirmInput;
    const rows = body.rows.map((row) => ({
      ...row,
      notes: row.notes ?? null,
    }));
    const result = await inventoryImportService.confirm(rows);
    res.status(201).json(result);
  },
};
