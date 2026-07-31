import assert from "node:assert/strict";
import { userRepository } from "../repositories/user.repository";
import { platformCompanyService } from "../services/platform-company.service";
import type { CreatePlatformCompanyInput } from "../schemas/platform-company.schema";

/**
 * Creates a company via the invitation-based platform API (no temporary passwords).
 * Uses the seeded CI platform admin as invitation actor when actorUserId is omitted.
 */
export async function createPlatformCompanyFixture(
  input: CreatePlatformCompanyInput,
  actorUserId?: string,
): Promise<Awaited<ReturnType<typeof platformCompanyService.createCompany>>> {
  let actorId = actorUserId;
  if (!actorId) {
    const admin = await userRepository.findByEmail("admin@dinamicsystems.com");
    assert.ok(admin?.isPlatformAdmin, "platform superadmin must exist for company fixtures");
    actorId = admin.id;
  }
  return platformCompanyService.createCompany(input, actorId);
}
