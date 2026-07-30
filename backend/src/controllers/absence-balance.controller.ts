import type { Request, Response } from "express";
import { absenceBalanceService } from "../services/absence-balance.service";
import { absenceBalanceLedgerService } from "../services/absence-balance-ledger.service";
import type {
  AdjustEmployeeAbsenceBalanceInput,
  ReverseAbsenceBalanceMovementInput,
  UpsertEmployeeAbsenceBalanceInput,
} from "../schemas/absence-balance.schema";
import { requireRequestCompanyId } from "../utils/request-company";
import type { AbsenceBalanceMovementType } from "../constants/absence-balance-ledger";

export const absenceBalanceController = {
  async listByEmployee(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const employeeId = String(req.params.employeeId);
    const { year } = req.validatedQuery as { year: number };
    const data = await absenceBalanceService.listEmployeeBalances(companyId, employeeId, year);
    res.status(200).json({ data });
  },

  /** @deprecated Prefer POST .../adjustments. Requires expectedVersion. */
  async upsert(req: Request, res: Response) {
    res.setHeader("Deprecation", "true");
    res.setHeader("Sunset", "absences-balance-put-legacy");
    const companyId = requireRequestCompanyId(req);
    const employeeId = String(req.params.employeeId);
    const absenceTypeId = String(req.params.absenceTypeId);
    const data = await absenceBalanceService.upsertEmployeeBalance(
      companyId,
      employeeId,
      absenceTypeId,
      req.body as UpsertEmployeeAbsenceBalanceInput,
      req.auth!.userId,
    );
    res.status(200).json({ data });
  },

  async listMovements(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const employeeId = String(req.params.employeeId);
    const absenceTypeId = String(req.params.absenceTypeId);
    const query = req.validatedQuery as {
      year?: number;
      page: number;
      limit: number;
      movementType?: AbsenceBalanceMovementType;
    };
    const result = await absenceBalanceLedgerService.listMovements(
      companyId,
      employeeId,
      absenceTypeId,
      {
        year: query.year,
        page: query.page,
        limit: query.limit,
        movementType: query.movementType,
      },
    );
    res.status(200).json({
      data: result.data,
      meta: {
        page: query.page,
        limit: query.limit,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit) || 0,
      },
    });
  },

  async adjust(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const employeeId = String(req.params.employeeId);
    const absenceTypeId = String(req.params.absenceTypeId);
    const body = req.body as AdjustEmployeeAbsenceBalanceInput;
    const movement = await absenceBalanceService.adjustEmployeeBalance(
      companyId,
      employeeId,
      absenceTypeId,
      body,
      req.auth!.userId,
    );
    res.status(201).json({ data: movement });
  },

  async reverse(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const employeeId = String(req.params.employeeId);
    const absenceTypeId = String(req.params.absenceTypeId);
    const movementId = String(req.params.movementId);
    const body = req.body as ReverseAbsenceBalanceMovementInput;
    const movement = await absenceBalanceService.reverseEmployeeBalanceMovement(
      companyId,
      employeeId,
      absenceTypeId,
      movementId,
      body,
      req.auth!.userId,
    );
    res.status(201).json({ data: movement });
  },
};
