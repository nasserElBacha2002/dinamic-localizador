import { Router } from "express";
import { env } from "../config/env";
import { marketingDemoController } from "../controllers/marketing-demo.controller";
import { asyncHandler } from "../middleware/async-handler";
import { createRateLimiter, defaultRateLimitKey } from "../middleware/rate-limit";
import { validate } from "../middleware/validate";
import { marketingDemoRequestSchema } from "../schemas/marketing-demo.schema";
import { marketingDemoEmailRateLimitKey } from "../utils/marketing/demo-lead-rate-limit-key";

const windowMs = env.MARKETING_DEMO_RATE_LIMIT_WINDOW_MINUTES * 60_000;

export const marketingDemoRouter = Router();

marketingDemoRouter.post(
  "/demo-requests",
  createRateLimiter({
    scope: "marketing-demo-ip",
    windowMs,
    max: env.MARKETING_DEMO_RATE_LIMIT_MAX,
  }),
  createRateLimiter({
    scope: "marketing-demo-email",
    windowMs,
    max: env.MARKETING_DEMO_RATE_LIMIT_MAX_PER_EMAIL,
    key: (req) => {
      const email = typeof req.body?.email === "string" ? req.body.email : "";
      return email ? marketingDemoEmailRateLimitKey(email) : "marketing-demo-email:missing";
    },
  }),
  validate(marketingDemoRequestSchema),
  asyncHandler(marketingDemoController.submit),
);