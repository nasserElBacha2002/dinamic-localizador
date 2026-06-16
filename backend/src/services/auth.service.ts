import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";
import { toPublicUser, userRepository } from "../repositories/user.repository";
import type { AuthTokenPayload, PublicUser } from "../types/auth";
import { normalizeEmail, verifyPassword } from "../utils/password";

const signToken = (payload: AuthTokenPayload): string =>
  jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });

export const authService = {
  async login(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
    const normalizedEmail = normalizeEmail(email);
    const user = await userRepository.findByEmail(normalizedEmail);

    if (!user || !user.active) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales inválidas.");
    }

    const validPassword = await verifyPassword(password, user.passwordHash);
    if (!validPassword) {
      throw new AppError(401, "INVALID_CREDENTIALS", "Credenciales inválidas.");
    }

    await userRepository.updateLastLogin(user.id);

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    return { token, user: toPublicUser(user) };
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
      const payload = jwt.verify(token, env.JWT_SECRET) as AuthTokenPayload;
      if (!payload.userId || !payload.email || !payload.role) {
        throw new AppError(401, "INVALID_TOKEN", "Token inválido.");
      }
      return payload;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(401, "INVALID_TOKEN", "Token inválido o expirado.");
    }
  },
};
