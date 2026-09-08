import type { Request, Response } from "express";
import { payrollQueryReconciliationService } from "../services/payroll-query-reconciliation.service";

export const payrollQueryReconciliationController = {
  async list(req: Request, res: Response): Promise<void> {
    const data = await payrollQueryReconciliationService.list(String(req.params.companyId));
    res.status(200).json({ data });
  },

  async reconcile(req: Request, res: Response): Promise<void> {
    const data = await payrollQueryReconciliationService.reconcile({
      companyId: String(req.params.companyId),
      deliveryId: String(req.params.deliveryId),
      commandId: req.body.commandId,
      expectedProcessingVersion: req.body.expectedProcessingVersion,
      resolution: req.body.resolution,
      reason: req.body.reason,
      providerMessageSid: req.body.providerMessageSid ?? null,
      userId: req.auth!.userId,
    });
    res.status(200).json({ data });
  },
};
