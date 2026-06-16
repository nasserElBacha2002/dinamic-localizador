import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { authService } from "../services/auth.service";
import type { AuthTokenPayload } from "../types/auth";

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthTokenPayload;
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Autenticación requerida." },
    });
    return;
  }

  const token = header.slice("Bearer ".length).trim();
  if (!token) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Autenticación requerida." },
    });
    return;
  }

  try {
    req.auth = authService.verifyToken(token);
    next();
  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json({
        error: { code: error.code, message: error.message },
      });
      return;
    }

    res.status(401).json({
      error: { code: "INVALID_TOKEN", message: "Token inválido o expirado." },
    });
  }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.auth || req.auth.role !== "ADMIN") {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "No tiene permisos para esta operación." },
    });
    return;
  }

  next();
};
