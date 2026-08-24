import { Router } from "express";
import { env } from "../config/env";
import { authController } from "../controllers/auth.controller";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate } from "../middleware/authenticate";
import { createRateLimiter, defaultRateLimitKey } from "../middleware/rate-limit";
import { validate } from "../middleware/validate";
import {
  forgotPasswordSchema,
  loginSchema,
  loginTwoFactorSchema,
  resetPasswordSchema,
  twoFactorConfirmSchema,
  twoFactorDisableSchema,
  twoFactorRegenerateSchema,
  twoFactorReconfigureConfirmSchema,
  twoFactorReconfigureSetupSchema,
} from "../schemas/auth.schema";
import { hashOpaqueToken } from "../utils/opaque-token";
import { normalizeEmail } from "../utils/password";

const loginWindowMs = env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000;
const resetWindowMs = env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MINUTES * 60_000;
const twoFactorWindowMs = env.TWO_FACTOR_LOGIN_RATE_LIMIT_WINDOW_MINUTES * 60_000;

export const authRouter = Router();

authRouter.post(
  "/login",
  createRateLimiter({
    scope: "auth-login",
    windowMs: loginWindowMs,
    max: env.AUTH_LOGIN_RATE_LIMIT_MAX,
  }),
  validate(loginSchema),
  asyncHandler(authController.login),
);

authRouter.post(
  "/login/2fa",
  createRateLimiter({
    scope: "auth-login-2fa",
    windowMs: twoFactorWindowMs,
    max: env.TWO_FACTOR_LOGIN_RATE_LIMIT_MAX,
    key: (req) => {
      const challenge =
        typeof req.body?.challengeToken === "string" ? req.body.challengeToken.trim() : "";
      const challengePart = challenge ? hashOpaqueToken(challenge).slice(0, 16) : "missing";
      return `${defaultRateLimitKey(req, "auth-login-2fa")}:ch:${challengePart}`;
    },
  }),
  validate(loginTwoFactorSchema),
  asyncHandler(authController.loginTwoFactor),
);

authRouter.post(
  "/forgot-password",
  createRateLimiter({
    scope: "auth-forgot-ip",
    windowMs: resetWindowMs,
    max: env.PASSWORD_RESET_RATE_LIMIT_MAX,
  }),
  createRateLimiter({
    scope: "auth-forgot-email",
    windowMs: resetWindowMs,
    max: env.PASSWORD_RESET_RATE_LIMIT_MAX,
    key: (req) => {
      const email =
        typeof req.body?.email === "string" ? normalizeEmail(req.body.email) : "missing";
      return `auth-forgot-email:${email || "missing"}`;
    },
  }),
  validate(forgotPasswordSchema),
  asyncHandler(authController.forgotPassword),
);

authRouter.post(
  "/reset-password",
  createRateLimiter({
    scope: "auth-reset",
    windowMs: resetWindowMs,
    max: env.PASSWORD_RESET_RATE_LIMIT_MAX,
  }),
  validate(resetPasswordSchema),
  asyncHandler(authController.resetPassword),
);

authRouter.get("/me", authenticate, asyncHandler(authController.me));

authRouter.get("/2fa/status", authenticate, asyncHandler(authController.twoFactorStatus));
authRouter.post("/2fa/setup", authenticate, asyncHandler(authController.twoFactorSetup));
authRouter.post(
  "/2fa/confirm",
  authenticate,
  createRateLimiter({
    scope: "auth-2fa-sensitive",
    windowMs: twoFactorWindowMs,
    max: env.TWO_FACTOR_LOGIN_RATE_LIMIT_MAX,
  }),
  validate(twoFactorConfirmSchema),
  asyncHandler(authController.twoFactorConfirm),
);
authRouter.post(
  "/2fa/disable",
  authenticate,
  createRateLimiter({
    scope: "auth-2fa-sensitive",
    windowMs: twoFactorWindowMs,
    max: env.TWO_FACTOR_LOGIN_RATE_LIMIT_MAX,
  }),
  validate(twoFactorDisableSchema),
  asyncHandler(authController.twoFactorDisable),
);
authRouter.post(
  "/2fa/recovery-codes/regenerate",
  authenticate,
  createRateLimiter({
    scope: "auth-2fa-sensitive",
    windowMs: twoFactorWindowMs,
    max: env.TWO_FACTOR_LOGIN_RATE_LIMIT_MAX,
  }),
  validate(twoFactorRegenerateSchema),
  asyncHandler(authController.twoFactorRegenerateRecovery),
);
authRouter.post(
  "/2fa/reconfigure/setup",
  authenticate,
  createRateLimiter({
    scope: "auth-2fa-reconfigure",
    windowMs: twoFactorWindowMs,
    max: env.TWO_FACTOR_LOGIN_RATE_LIMIT_MAX,
  }),
  validate(twoFactorReconfigureSetupSchema),
  asyncHandler(authController.twoFactorReconfigureSetup),
);
authRouter.post(
  "/2fa/reconfigure/confirm",
  authenticate,
  createRateLimiter({
    scope: "auth-2fa-reconfigure",
    windowMs: twoFactorWindowMs,
    max: env.TWO_FACTOR_LOGIN_RATE_LIMIT_MAX,
  }),
  validate(twoFactorReconfigureConfirmSchema),
  asyncHandler(authController.twoFactorReconfigureConfirm),
);
authRouter.delete(
  "/2fa/reconfigure",
  authenticate,
  asyncHandler(authController.twoFactorReconfigureCancel),
);
