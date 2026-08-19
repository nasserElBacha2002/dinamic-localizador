import type { Request, Response } from "express";
import { authService } from "../services/auth.service";
import { passwordResetService } from "../services/password-reset.service";
import { twoFactorService } from "../services/two-factor.service";

export const authController = {
  async login(req: Request, res: Response) {
    const result = await authService.login(req.body.email, req.body.password);
    res.status(200).json({ data: result });
  },

  async loginTwoFactor(req: Request, res: Response) {
    const result = await twoFactorService.completeLogin({
      challengeToken: req.body.challengeToken,
      code: req.body.code,
      recoveryCode: req.body.recoveryCode,
    });
    res.status(200).json({ data: { requiresTwoFactor: false, ...result } });
  },

  async me(req: Request, res: Response) {
    const user = await authService.getCurrentUser(req.auth!.userId);
    res.status(200).json({ data: user });
  },

  async forgotPassword(req: Request, res: Response) {
    const result = await passwordResetService.forgotPassword(req.body.email);
    res.status(200).json({ data: result });
  },

  async resetPassword(req: Request, res: Response) {
    const result = await passwordResetService.resetPassword(
      req.body.token,
      req.body.password,
    );
    res.status(200).json({ data: result });
  },

  async twoFactorSetup(req: Request, res: Response) {
    const result = await twoFactorService.startSetup(req.auth!.userId);
    res.status(200).json({ data: result });
  },

  async twoFactorConfirm(req: Request, res: Response) {
    const result = await twoFactorService.confirmSetup(req.auth!.userId, {
      password: req.body.password,
      code: req.body.code,
    });
    res.status(200).json({ data: result });
  },

  async twoFactorStatus(req: Request, res: Response) {
    const result = await twoFactorService.getStatus(req.auth!.userId);
    res.status(200).json({ data: result });
  },

  async twoFactorDisable(req: Request, res: Response) {
    await twoFactorService.disable(req.auth!.userId, {
      password: req.body.password,
      code: req.body.code,
      recoveryCode: req.body.recoveryCode,
    });
    res.status(200).json({
      data: { message: "La autenticación en dos pasos quedó desactivada. Volvé a iniciar sesión." },
    });
  },

  async twoFactorRegenerateRecovery(req: Request, res: Response) {
    const result = await twoFactorService.regenerateRecoveryCodes(req.auth!.userId, {
      password: req.body.password,
      code: req.body.code,
    });
    res.status(200).json({ data: result });
  },

  async twoFactorReconfigureSetup(req: Request, res: Response) {
    const result = await twoFactorService.startReconfigure(req.auth!.userId, {
      password: req.body.password,
      code: req.body.code,
      recoveryCode: req.body.recoveryCode,
    });
    res.status(200).json({ data: result });
  },

  async twoFactorReconfigureConfirm(req: Request, res: Response) {
    const result = await twoFactorService.confirmReconfigure(req.auth!.userId, {
      code: req.body.code,
    });
    res.status(200).json({ data: result });
  },

  async twoFactorReconfigureCancel(req: Request, res: Response) {
    await twoFactorService.cancelReconfigure(req.auth!.userId);
    res.status(200).json({
      data: { message: "Se canceló la reconfiguración. El autenticador actual sigue activo." },
    });
  },
};
