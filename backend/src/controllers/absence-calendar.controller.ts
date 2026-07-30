import type { Request, Response } from "express";
import { absenceCalendarService } from "../services/absence-calendar.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const absenceCalendarController = {
  async listCalendars(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await absenceCalendarService.listCalendars(companyId);
    res.status(200).json({ data });
  },

  async getDefault(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await absenceCalendarService.getDefaultCalendar(companyId);
    res.status(200).json({ data });
  },

  async updateCalendar(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await absenceCalendarService.updateCalendar(
      companyId,
      String(req.params.calendarId),
      req.body,
      req.auth?.userId ?? null,
    );
    res.status(200).json({ data });
  },

  async listDates(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const query = req.validatedQuery as { year?: number; includeInactive?: boolean };
    const data = await absenceCalendarService.listDates(
      companyId,
      String(req.params.calendarId),
      query,
    );
    res.status(200).json({ data });
  },

  async createDate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await absenceCalendarService.createDate(
      companyId,
      req.body,
      req.auth?.userId ?? null,
    );
    res.status(201).json({ data });
  },

  async updateDate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await absenceCalendarService.updateDate(
      companyId,
      String(req.params.dateId),
      req.body,
      req.auth?.userId ?? null,
    );
    res.status(200).json({ data });
  },

  async calculate(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const data = await absenceCalendarService.preview(companyId, req.body);
    res.status(200).json({ data });
  },
};
