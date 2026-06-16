import { Router } from "express";
import { getApiHealth, getDatabaseHealth } from "../controllers/health.controller";

export const healthRouter = Router();

healthRouter.get("/health", getApiHealth);
healthRouter.get("/health/database", getDatabaseHealth);
