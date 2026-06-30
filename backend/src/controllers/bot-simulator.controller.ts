import type { Request, Response } from "express";
import {
  createBotSimulationSessionSchema,
  sendBotSimulationLocationSchema,
  sendBotSimulationMessageSchema,
} from "../schemas/bot-simulator.schema";
import { botSimulatorService } from "../services/bot-simulator.service";

export const botSimulatorController = {
  async createSession(req: Request, res: Response): Promise<void> {
    const parsed = createBotSimulationSessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      });
      return;
    }

    const session = await botSimulatorService.createSession(parsed.data, req.auth?.userId ?? null);
    res.status(201).json(session);
  },

  async getSession(req: Request, res: Response): Promise<void> {
    const session = await botSimulatorService.getSession(String(req.params.id));
    res.json(session);
  },

  async restartSession(req: Request, res: Response): Promise<void> {
    const session = await botSimulatorService.restartSession(String(req.params.id));
    res.json(session);
  },

  async sendMessage(req: Request, res: Response): Promise<void> {
    const parsed = sendBotSimulationMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      });
      return;
    }

    const session = await botSimulatorService.sendMessage(parsed.data);
    res.json(session);
  },

  async sendLocation(req: Request, res: Response): Promise<void> {
    const parsed = sendBotSimulationLocationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "Datos inválidos." },
      });
      return;
    }

    const session = await botSimulatorService.sendLocation(parsed.data);
    res.json(session);
  },

  async getLocationPresets(req: Request, res: Response): Promise<void> {
    const presets = await botSimulatorService.getLocationPresets(String(req.params.id));
    res.json(presets);
  },
};
