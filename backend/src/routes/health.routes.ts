import { Router } from "express";
import { getApiHealth, getDatabaseHealth, getReadiness } from "../controllers/health.controller";

export const healthRouter = Router();

healthRouter.get("/health", getApiHealth);
healthRouter.get("/health/database", getDatabaseHealth);
healthRouter.get("/health/ready", getReadiness);
healthRouter.get("/ready", getReadiness);
