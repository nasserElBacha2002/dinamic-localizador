import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";
import { userRepository } from "../repositories/user.repository";
import { authService, isSessionValid } from "../services/auth.service";
import type { AuthTokenPayload } from "../types/auth";

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthTokenPayload;
  }
}

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice("Bearer ".length).trim();
  return token || null;
}

async function resolveAuthenticatedPayload(token: string): Promise<AuthTokenPayload> {
  const payload = authService.verifyToken(token);
  const user = await userRepository.findById(payload.userId);
  if (!user || !isSessionValid(user, payload.tokenVersion)) {
    throw new AppError(401, "INVALID_TOKEN", "Token inválido o expirado.");
  }
  return payload;
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Autenticación requerida." },
    });
    return;
  }

  void (async () => {
    try {
      req.auth = await resolveAuthenticatedPayload(token);
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
  })();
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
