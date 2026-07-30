import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import sql from "mssql";
import { getPool } from "../database/connection";
import { buildAbsenceBalanceIdempotencyKey } from "../constants/absence-balance-ledger";
import { absenceBalanceService } from "../services/absence-balance.service";
import { absenceBalanceLedgerService } from "../services/absence-balance-ledger.service";
import { absenceBalanceLedgerRepository } from "../repositories/absence-balance-ledger.repository";
import type {
  AdjustEmployeeAbsenceBalanceInput,
  UpsertEmployeeAbsenceBalanceInput,
} from "../schemas/absence-balance.schema";
import { requireRequestCompanyId } from "../utils/request-company";
import { rollbackTransactionSafely } from "../utils/sql-transaction";
import { AppError } from "../errors/app-error";

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
      movementType?: string;
    };
    const result = await absenceBalanceLedgerService.listMovements(
      companyId,
      employeeId,
      absenceTypeId,
      {
        year: query.year,
        page: query.page,
        limit: query.limit,
        movementType: query.movementType as never,
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

    if (!(await absenceBalanceLedgerService.isLedgerEnabled(companyId))) {
      throw new AppError(
        409,
        "ABSENCE_BALANCE_LEDGER_DISABLED",
        "El ledger de saldos no está activo para esta empresa",
      );
    }

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const balance = await absenceBalanceLedgerRepository.ensureBalanceRow(
        companyId,
        employeeId,
        absenceTypeId,
        body.year,
        transaction,
      );
      const movement = await absenceBalanceLedgerService.manualAdjustment(
        companyId,
        {
          employeeId,
          absenceTypeId,
          year: body.year,
          quantity: body.quantity,
          operation: body.operation,
          reason: body.reason,
          idempotencyKey:
            body.idempotencyKey ??
            buildAbsenceBalanceIdempotencyKey.manual(balance.id, randomUUID()),
          actor: { userId: req.auth!.userId },
        },
        transaction,
      );
      await transaction.commit();
      res.status(201).json({ data: movement });
    } catch (error) {
      return rollbackTransactionSafely(
        transaction,
        { operation: "absence-balance.adjust", companyId, entityId: employeeId },
        error,
      );
    }
  },
};
