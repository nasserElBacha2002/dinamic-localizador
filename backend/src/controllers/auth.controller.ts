import type { Request, Response } from "express";
import { authService } from "../services/auth.service";

export const authController = {
  async login(req: Request, res: Response) {
    const result = await authService.login(req.body.email, req.body.password);
    res.status(200).json({ data: result });
  },

  async me(req: Request, res: Response) {
    const user = await authService.getCurrentUser(req.auth!.userId);
    res.status(200).json({ data: user });
  },
};
