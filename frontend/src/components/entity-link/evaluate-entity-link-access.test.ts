import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NAVIGABLE_ENTITY_DEFINITIONS } from "../../routes/navigable-entity-definitions";
import {
  evaluateEntityLinkAccess,
  toEntityLinkAccessState,
  type EntityLinkAccessContext,
} from "./evaluate-entity-link-access";

const baseContext = (
  overrides: Partial<EntityLinkAccessContext> = {},
): EntityLinkAccessContext => ({
  authLoading: false,
  isPlatformAdmin: false,
  modulesLoading: false,
  modulesError: false,
  modules: [
    {
      companyId: "co-1",
      moduleKey: "operations",
      isEnabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      companyId: "co-1",
      moduleKey: "attendance",
      isEnabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    {
      companyId: "co-1",
      moduleKey: "absences",
      isEnabled: true,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
  permissionsLoading: false,
  permissions: ["employees:read", "services:read", "operations:read", "attendance:read"],
  ...overrides,
});

describe("evaluateEntityLinkAccess", () => {
  it("allows employee when module and permission match", () => {
    const decision = evaluateEntityLinkAccess(NAVIGABLE_ENTITY_DEFINITIONS.employee, baseContext());
    assert.equal(decision.status, "allowed");
    assert.equal(toEntityLinkAccessState(decision), "allowed");
  });

  it("denies when permission missing", () => {
    const decision = evaluateEntityLinkAccess(
      NAVIGABLE_ENTITY_DEFINITIONS.employee,
      baseContext({ permissions: ["services:read"] }),
    );
    assert.deepEqual(decision, { status: "denied", reason: "permission" });
  });

  it("denies when module disabled", () => {
    const decision = evaluateEntityLinkAccess(
      NAVIGABLE_ENTITY_DEFINITIONS.service,
      baseContext({
        modules: [
          {
            companyId: "co-1",
            moduleKey: "operations",
            isEnabled: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    assert.deepEqual(decision, { status: "denied", reason: "module" });
  });

  it("returns loading while modules load", () => {
    const decision = evaluateEntityLinkAccess(
      NAVIGABLE_ENTITY_DEFINITIONS.operation,
      baseContext({ modulesLoading: true }),
    );
    assert.equal(decision.status, "loading");
  });

  it("returns loading while permissions load", () => {
    const decision = evaluateEntityLinkAccess(
      NAVIGABLE_ENTITY_DEFINITIONS.operation,
      baseContext({ permissionsLoading: true }),
    );
    assert.equal(decision.status, "loading");
  });

  it("denies when modules query errored", () => {
    const decision = evaluateEntityLinkAccess(
      NAVIGABLE_ENTITY_DEFINITIONS.service,
      baseContext({ modulesError: true, modules: undefined }),
    );
    assert.deepEqual(decision, { status: "denied", reason: "modules_unavailable" });
  });

  it("allows platform admin for whatsappConversation", () => {
    const decision = evaluateEntityLinkAccess(
      NAVIGABLE_ENTITY_DEFINITIONS.whatsappConversation,
      baseContext({ isPlatformAdmin: true }),
    );
    assert.equal(decision.status, "allowed");
  });

  it("denies non-platform user for whatsappConversation", () => {
    const decision = evaluateEntityLinkAccess(
      NAVIGABLE_ENTITY_DEFINITIONS.whatsappConversation,
      baseContext({ isPlatformAdmin: false }),
    );
    assert.deepEqual(decision, { status: "denied", reason: "platform_admin" });
  });

  it("returns loading while auth loads for platform-only routes", () => {
    const decision = evaluateEntityLinkAccess(
      NAVIGABLE_ENTITY_DEFINITIONS.whatsappConversation,
      baseContext({ authLoading: true }),
    );
    assert.equal(decision.status, "loading");
  });

  it("denies non-platform user for bot simulator even when module is enabled", () => {
    const decision = evaluateEntityLinkAccess(
      { requirePlatformAdmin: true, moduleKey: "bot_simulator" },
      baseContext({
        isPlatformAdmin: false,
        modules: [
          {
            companyId: "co-1",
            moduleKey: "bot_simulator",
            isEnabled: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    assert.deepEqual(decision, { status: "denied", reason: "platform_admin" });
  });

  it("allows platform admin for bot simulator when module is enabled", () => {
    const decision = evaluateEntityLinkAccess(
      { requirePlatformAdmin: true, moduleKey: "bot_simulator" },
      baseContext({
        isPlatformAdmin: true,
        modules: [
          {
            companyId: "co-1",
            moduleKey: "bot_simulator",
            isEnabled: true,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    assert.equal(decision.status, "allowed");
  });

  it("denies platform admin for bot simulator when module is disabled", () => {
    const decision = evaluateEntityLinkAccess(
      { requirePlatformAdmin: true, moduleKey: "bot_simulator" },
      baseContext({
        isPlatformAdmin: true,
        modules: [
          {
            companyId: "co-1",
            moduleKey: "bot_simulator",
            isEnabled: false,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    assert.deepEqual(decision, { status: "denied", reason: "module" });
  });
});
