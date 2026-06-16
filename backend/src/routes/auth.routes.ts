import { Router } from "express";
import { authController } from "../controllers/auth.controller";
import { asyncHandler } from "../middleware/async-handler";
import { authenticate } from "../middleware/authenticate";
import { validate } from "../middleware/validate";
import { loginSchema } from "../schemas/auth.schema";

export const authRouter = Router();

authRouter.post("/login", validate(loginSchema), asyncHandler(authController.login));
authRouter.get("/me", authenticate, asyncHandler(authController.me));
