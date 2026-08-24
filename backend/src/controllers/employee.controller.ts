import type { Request, Response } from "express";
import { employeeService } from "../services/employee.service";
import { employeeDeactivationService } from "../services/employee-deactivation.service";
import { employeeAvailabilityService } from "../services/employee-availability.service";
import { employeeOperationsService } from "../services/employee-operations.service";
import { requireRequestCompanyId } from "../utils/request-company";
import { projectEmployeeForRole } from "../utils/employee-residence-privacy";

export const employeeController = {
  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const employee = await employeeService.create(companyId, req.body);
    res.status(201).json({ data: projectEmployeeForRole(employee, req.companyRole) });
  },

  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await employeeService.list(companyId, req.validatedQuery as never);
    res.status(200).json({
      ...result,
      data: result.data.map((employee) => projectEmployeeForRole(employee, req.companyRole)),
    });
  },

  async getById(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const employee = await employeeService.getById(companyId, String(req.params.id));
    res.status(200).json({ data: projectEmployeeForRole(employee, req.companyRole) });
  },

  async getOperationalAvailability(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const summary = await employeeAvailabilityService.getOperationalSummary(
      companyId,
      String(req.params.id),
    );
    res.status(200).json({ data: summary });
  },

  async listOperations(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await employeeOperationsService.list(
      companyId,
      String(req.params.id),
      req.validatedQuery as never,
    );
    res.status(200).json(result);
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
    res.status(200).json({ data: projectEmployeeForRole(employee, req.companyRole) });
  },

  async deactivate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await employeeDeactivationService.deactivate(
      companyId,
      String(req.params.id),
      req.body ?? {},
      req.auth?.userId ?? null,
    );
    res.status(200).json({
      data: projectEmployeeForRole(result.employee, req.companyRole),
      meta: {
        removedAssignmentIds: result.removedAssignmentIds,
        endedAssignments: result.endedAssignments,
        cancelledExpectationIds: result.cancelledExpectationIds,
        removedWorkTeams: result.removedWorkTeams,
      },
    });
  },

  /** @deprecated Prefer POST /:id/deactivate. Soft-deactivates without profile updates. */
  async deactivateLegacy(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await employeeDeactivationService.deactivate(
      companyId,
      String(req.params.id),
      { confirmAffectedRelease: false },
      req.auth?.userId ?? null,
    );
    res.status(200).json({ data: projectEmployeeForRole(result.employee, req.companyRole) });
  },
};
