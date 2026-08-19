import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { toPublicUser, userRepository } from "../repositories/user.repository";
import { issueLoginChallenge } from "./two-factor.service";
import type { AuthTokenPayload, LoginResult, PublicUser, User } from "../types/auth";
import { signSessionToken } from "../utils/auth-token";
import { DUMMY_PASSWORD_HASH, normalizeEmail, verifyPassword } from "../utils/password";

export function readJwtTokenVersion(payload: { tokenVersion?: unknown }): number {
  // Pre-097 JWTs omit tokenVersion; treat as 0 so they remain valid until
  // token_version is bumped (password reset / password hash update).
  return typeof payload.tokenVersion === "number" &&
    Number.isInteger(payload.tokenVersion) &&
    payload.tokenVersion >= 0
    ? payload.tokenVersion
    : 0;
}

export function isSessionValid(user: User, tokenVersion: number): boolean {
  return user.active && (user.tokenVersion ?? 0) === tokenVersion;
}

export const authService = {
  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = normalizeEmail(email);
    const user = await userRepository.findByEmail(normalizedEmail);
    const passwordHash = user ? user.passwordHash : DUMMY_PASSWORD_HASH;
    const validPassword = await verifyPassword(password, passwordHash);

    if (!user || !user.active || !validPassword) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales inválidas.");
    }

    if (user.twoFactorEnabled) {
      return {
        requiresTwoFactor: true,
        challengeToken: await issueLoginChallenge(user),
      };
    }

    await userRepository.updateLastLogin(user.id);
    return {
      requiresTwoFactor: false,
      token: signSessionToken(user),
      user: toPublicUser(user),
    };
  },

  async getCurrentUser(userId: string): Promise<PublicUser> {
    const user = await userRepository.findById(userId);
    if (!user || !user.active) {
      throw new AppError(403, "USER_INACTIVE", "Usuario inactivo o no encontrado.");
    }

    return toPublicUser(user);
  },

  verifyToken(token: string): AuthTokenPayload {
    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload & Partial<AuthTokenPayload>;
      if (!payload.userId || !payload.email || !payload.role) {
        throw new AppError(401, "INVALID_TOKEN", "Token inválido.");
      }
      return {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        tokenVersion: readJwtTokenVersion(payload),
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(401, "INVALID_TOKEN", "Token inválido o expirado.");
    }
  },
};
