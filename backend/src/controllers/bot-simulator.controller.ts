import type { Request, Response } from "express";
import {
  createBotSimulationSessionSchema,
  sendBotSimulationLocationSchema,
  sendBotSimulationMessageSchema,
} from "../schemas/bot-simulator.schema";
import { botSimulatorService } from "../services/bot-simulator.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const botSimulatorController = {
  async createSession(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const parsed = createBotSimulationSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      });
      return;
    }

    const session = await botSimulatorService.createSession(
      companyId,
      parsed.data,
      req.auth?.userId ?? null,
    );
    res.status(201).json(session);
  },

  async getSession(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const session = await botSimulatorService.getSession(companyId, String(req.params.id));
    res.json(session);
  },

  async restartSession(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const session = await botSimulatorService.restartSession(companyId, String(req.params.id));
    res.json(session);
  },

  async sendMessage(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const parsed = sendBotSimulationMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      });
      return;
    }

    const session = await botSimulatorService.sendMessage(companyId, parsed.data);
    res.json(session);
  },

  async sendLocation(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const parsed = sendBotSimulationLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      });
      return;
    }

    const session = await botSimulatorService.sendLocation(companyId, parsed.data);
    res.json(session);
  },

  async getLocationPresets(req: Request, res: Response): Promise<void> {
    const companyId = requireRequestCompanyId(req);
    const presets = await botSimulatorService.getLocationPresets(companyId, String(req.params.id));
    res.json(presets);
  },
};
