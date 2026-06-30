import { Router } from "express";
import { botSimulatorController } from "../controllers/bot-simulator.controller";

export const botSimulatorRouter = Router();

botSimulatorRouter.post("/session", botSimulatorController.createSession);
botSimulatorRouter.get("/session/:id", botSimulatorController.getSession);
botSimulatorRouter.post("/session/:id/restart", botSimulatorController.restartSession);
botSimulatorRouter.get("/session/:id/location-presets", botSimulatorController.getLocationPresets);
botSimulatorRouter.post("/message", botSimulatorController.sendMessage);
botSimulatorRouter.post("/location", botSimulatorController.sendLocation);
