import type { Request, Response } from "express";
import { absenceBalanceService } from "../services/absence-balance.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const absenceBalanceController = {
  async listByEmployee(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const employeeId = String(req.params.employeeId);
    const { year } = req.validatedQuery as { year: number };
    const data = await absenceBalanceService.listEmployeeBalances(companyId, employeeId, year);
    res.status(200).json({ data });
  },

  async upsert(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const employeeId = String(req.params.employeeId);
    const absenceTypeId = String(req.params.absenceTypeId);
    const data = await absenceBalanceService.upsertEmployeeBalance(
      companyId,
      employeeId,
      absenceTypeId,
      req.body,
      req.auth!.userId,
    );
    res.status(200).json({ data });
  },
};
