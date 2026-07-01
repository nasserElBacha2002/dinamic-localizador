import { Router } from "express";
import { botSimulatorController } from "../controllers/bot-simulator.controller";
import { requireAnyPermission } from "../middleware/company-context";

export const botSimulatorRouter = Router();

const readBotSimulator = requireAnyPermission("attendance:read", "inventories:read");
const manageBotSimulator = requireAnyPermission("attendance:review", "inventories:manage");

botSimulatorRouter.post("/session", manageBotSimulator, botSimulatorController.createSession);
botSimulatorRouter.get("/session/:id", readBotSimulator, botSimulatorController.getSession);
botSimulatorRouter.post(
  "/session/:id/restart",
  manageBotSimulator,
  botSimulatorController.restartSession,
);
botSimulatorRouter.get(
  "/session/:id/location-presets",
  readBotSimulator,
  botSimulatorController.getLocationPresets,
);
botSimulatorRouter.post("/message", manageBotSimulator, botSimulatorController.sendMessage);
botSimulatorRouter.post("/location", manageBotSimulator, botSimulatorController.sendLocation);
