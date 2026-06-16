import type { Request, Response } from "express";
import { inventoryAssignmentService } from "../services/inventory-assignment.service";

export const inventoryAssignmentController = {
  async assignEmployee(req: Request, res: Response) {
    const assignment = await inventoryAssignmentService.assignEmployee(
      String(req.params.inventoryId),
      req.body.employeeId,
    );
    res.status(201).json({ data: assignment });
  },

  async listAssignedEmployees(req: Request, res: Response) {
    const items = await inventoryAssignmentService.listAssignedEmployees(String(req.params.inventoryId));
    res.status(200).json({ data: items });
  },

  async unassignEmployee(req: Request, res: Response) {
    await inventoryAssignmentService.unassignEmployee(
      String(req.params.inventoryId),
      String(req.params.employeeId),
    );
    res.status(204).send();
  },
};
