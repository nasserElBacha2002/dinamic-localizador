import type { Request, Response } from "express";
import { inventoryAssignmentService } from "../services/inventory-assignment.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const inventoryAssignmentController = {
  async assignEmployee(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const assignment = await inventoryAssignmentService.assignEmployee(
      companyId,
      String(req.params.inventoryId),
      req.body.employeeId,
    );
    res.status(201).json({ data: assignment });
  },

  async listAssignedEmployees(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const items = await inventoryAssignmentService.listAssignedEmployees(
      companyId,
      String(req.params.inventoryId),
    );
    res.status(200).json({ data: items });
  },

  async unassignEmployee(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    await inventoryAssignmentService.unassignEmployee(
      companyId,
      String(req.params.inventoryId),
      String(req.params.employeeId),
    );
    res.status(204).send();
  },
};
