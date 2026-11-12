import type { Request, Response } from "express";
import { employeeService } from "../services/employees/employee.service";
import { employeeDeactivationService } from "../services/employees/employee-deactivation.service";
import { employeeAvailabilityService } from "../services/employees/employee-availability.service";
import { employeeOperationsService } from "../services/employees/employee-operations.service";
import { employeeClientService } from "../services/employees/employee-client.service";
import type { ListEmployeeOperationsQuery } from "../schemas/employee.schema";
import { requireRequestCompanyId } from "../utils/request-company";
import { projectEmployeeForRole } from "../utils/employees/employee-residence-privacy";
import { employeeOperationalAccessService } from "../services/employees/employee-operational-access.service";

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

  async listClients(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await employeeClientService.listForEmployee(companyId, String(req.params.id));
    res.status(200).json(result);
  },

  async replaceClients(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await employeeClientService.replaceForEmployee(
      companyId,
      String(req.params.id),
      req.body.clientIds,
      req.auth?.userId ?? null,
    );
    res.status(200).json(result);
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
    const query = req.validatedQuery as ListEmployeeOperationsQuery;
    const result = await employeeOperationsService.list(
      companyId,
      String(req.params.id),
      query,
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

  async getOperationalAccess(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await employeeOperationalAccessService.getStatus(companyId, String(req.params.id));
    res.status(200).json({ data });
  },

  async linkOperationalAccess(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await employeeOperationalAccessService.linkExistingUser(
      companyId,
      req.auth?.userId ?? null,
      String(req.params.id),
      String(req.body.userId),
      req.companyRole,
      Boolean(req.isPlatformAdmin),
    );
    res.status(200).json({ data });
  },

  async inviteOperationalAccess(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await employeeOperationalAccessService.inviteUser(
      companyId,
      req.auth?.userId ?? null,
      String(req.params.id),
      req.body,
      req.companyRole,
      Boolean(req.isPlatformAdmin),
    );
    res.status(201).json({
      data: {
        invitationId: result.invitation.id,
        email: result.invitation.emailNormalized,
        status: result.invitation.status,
        expiresAt: result.invitation.expiresAt,
        emailSent: result.emailSent,
      },
      message: result.message,
    });
  },

  async revokeOperationalAccess(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await employeeOperationalAccessService.revokeAccess(
      companyId,
      req.auth?.userId ?? null,
      String(req.params.id),
    );
    res.status(200).json({ data });
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
