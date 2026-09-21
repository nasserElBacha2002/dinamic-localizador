import type { Request, Response } from "express";
import type { CreateAttendanceInput } from "../schemas/attendance.schema";
import { attendanceService } from "../services/attendance.service";
import { manualAttendanceService } from "../services/manual-attendance.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const attendanceController = {
  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const body = (req.body ?? {}) as CreateAttendanceInput;
    const record = await attendanceService.create(companyId, body);
    res.status(201).json({ data: record });
  },

  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const result = await attendanceService.list(companyId, req.validatedQuery as never);
    res.status(200).json(result);
  },

  async exportCsv(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const csv = await attendanceService.exportCsv(companyId, req.validatedQuery as never);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="asistencias.csv"');
    res.status(200).send(`\uFEFF${csv}`);
  },

  async getById(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const record = await attendanceService.getById(companyId, String(req.params.id));
    res.status(200).json({ data: record });
  },

  async listReviews(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const query = req.validatedQuery as { page: number; limit: number };
    const result = await attendanceService.listReviews(
      companyId,
      String(req.params.id),
      query.page,
      query.limit,
    );
    res.status(200).json(result);
  },

  async listAuditLogs(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const query = req.validatedQuery as { page: number; limit: number };
    const result = await attendanceService.listAuditLogs(
      companyId,
      String(req.params.id),
      query.page,
      query.limit,
    );
    res.status(200).json(result);
  },

  async review(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const record = await attendanceService.review(
      companyId,
      String(req.params.id),
      req.auth!.userId,
      req.body,
    );
    res.status(200).json({ data: record });
  },

  async previewManual(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const preview = await manualAttendanceService.preview(companyId, req.body);
    res.status(200).json({ data: preview });
  },

  async createManual(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const record = await manualAttendanceService.create(
      companyId,
      req.auth!.userId,
      req.body,
    );
    res.status(201).json({ data: record });
  },

  async editManual(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const record = await manualAttendanceService.edit(
      companyId,
      req.auth!.userId,
      String(req.params.id),
      req.body,
    );
    res.status(200).json({ data: record });
  },
};
