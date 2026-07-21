import type { Request, Response } from "express";
import { employeeService } from "../services/employee.service";
import { employeeDeactivationService } from "../services/employee-deactivation.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const employeeController = {
  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const employee = await employeeService.create(companyId, req.body);
    res.status(201).json({ data: employee });
  },

  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await employeeService.list(companyId, req.validatedQuery as never);
    res.status(200).json(result);
  },

  async getById(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const employee = await employeeService.getById(companyId, String(req.params.id));
    res.status(200).json({ data: employee });
  },

  async getDeactivationImpact(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const impact = await employeeDeactivationService.getDeactivationImpact(
      companyId,
      String(req.params.id),
    );
    res.status(200).json({ data: impact });
  },

  async update(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const employee = await employeeService.update(companyId, String(req.params.id), req.body);
    res.status(200).json({ data: employee });
  },

  async deactivate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await employeeDeactivationService.deactivate(
      companyId,
      String(req.params.id),
      req.body ?? {},
      req.auth?.userId ?? null,
    );
    res.status(200).json({ data: result.employee, meta: {
      removedAssignments: result.removedAssignments,
      removedWorkTeams: result.removedWorkTeams,
    } });
  },
};
