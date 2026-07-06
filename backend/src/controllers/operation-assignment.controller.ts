import type { Request, Response } from "express";
import { operationAssignmentService } from "../services/operation-assignment.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const operationAssignmentController = {
  async assignEmployee(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const assignment = await operationAssignmentService.assignEmployee(
      companyId,
      String(req.params.operationId),
      req.body.employeeId,
    );
    res.status(201).json({ data: assignment });
  },

  async listAssignedEmployees(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const items = await operationAssignmentService.listAssignedEmployees(
      companyId,
      String(req.params.operationId),
    );
    res.status(200).json({ data: items });
  },

  async unassignEmployee(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    await operationAssignmentService.unassignEmployee(
      companyId,
      String(req.params.operationId),
      String(req.params.employeeId),
    );
    res.status(204).send();
  },
};
