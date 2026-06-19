import type { Request, Response } from "express";
import { attendanceService } from "../services/attendance.service";

export const attendanceController = {
  async create(req: Request, res: Response) {
    const record = await attendanceService.create(req.body);
    res.status(201).json({ data: record });
  },

  async list(req: Request, res: Response) {
    const result = await attendanceService.list(req.validatedQuery as never);
    res.status(200).json(result);
  },

  async exportCsv(req: Request, res: Response) {
    const csv = await attendanceService.exportCsv(req.validatedQuery as never);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="asistencias.csv"');
    res.status(200).send(`\uFEFF${csv}`);
  },

  async getById(req: Request, res: Response) {
    const record = await attendanceService.getById(String(req.params.id));
    res.status(200).json({ data: record });
  },

  async listReviews(req: Request, res: Response) {
    const query = req.validatedQuery as { page: number; limit: number };
    const result = await attendanceService.listReviews(
      String(req.params.id),
      query.page,
      query.limit,
    );
    res.status(200).json(result);
  },

  async review(req: Request, res: Response) {
    const record = await attendanceService.review(
      String(req.params.id),
      req.auth!.userId,
      req.body,
    );
    res.status(200).json({ data: record });
  },
};
