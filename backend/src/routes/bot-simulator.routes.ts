import { Router } from "express";
import { botSimulatorController } from "../controllers/bot-simulator.controller";
import { requirePermission } from "../middleware/company-context";

export const botSimulatorRouter = Router();

const useBotSimulator = requirePermission("bot_simulator:use");

botSimulatorRouter.post("/session", useBotSimulator, botSimulatorController.createSession);
botSimulatorRouter.get("/session/:id", useBotSimulator, botSimulatorController.getSession);
botSimulatorRouter.post(
  "/session/:id/restart",
  useBotSimulator,
  botSimulatorController.restartSession,
);
botSimulatorRouter.get(
  "/session/:id/location-presets",
  useBotSimulator,
  botSimulatorController.getLocationPresets,
);
botSimulatorRouter.post("/message", useBotSimulator, botSimulatorController.sendMessage);
botSimulatorRouter.post("/location", useBotSimulator, botSimulatorController.sendLocation);
