import { normalizeEmail } from "../utils/password";
import { userRepository } from "../repositories/identity/user.repository";
/** Must match `integration-database-seed` and CI `ADMIN_EMAIL`. */
export const INTEGRATION_PLATFORM_ADMIN_EMAIL_DEFAULT = "admin@dinamicsystems.com";

export const resolveIntegrationPlatformAdminEmail = (): string =>
  normalizeEmail(process.env.ADMIN_EMAIL?.trim() || INTEGRATION_PLATFORM_ADMIN_EMAIL_DEFAULT);

export const findIntegrationPlatformAdmin = async () =>
  userRepository.findByEmail(resolveIntegrationPlatformAdminEmail());