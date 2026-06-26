import type { Request, Response } from "express";
import { absenceBalanceService } from "../services/absence-balance.service";

export const absenceBalanceController = {
  async listByEmployee(req: Request, res: Response) {
    const employeeId = String(req.params.employeeId);
    const { year } = req.validatedQuery as { year: number };
    const data = await absenceBalanceService.listEmployeeBalances(employeeId, year);
    res.status(200).json({ data });
  },

  async upsert(req: Request, res: Response) {
    const employeeId = String(req.params.employeeId);
    const absenceTypeId = String(req.params.absenceTypeId);
    const data = await absenceBalanceService.upsertEmployeeBalance(
      employeeId,
      absenceTypeId,
      req.body,
      req.auth!.userId,
    );
    res.status(200).json({ data });
  },
};
