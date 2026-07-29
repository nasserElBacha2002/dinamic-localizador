import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  areEmployeeIdSetsEqual,
  executeWorkTeamSave,
  normalizeEmployeeIds,
  planWorkTeamSave,
  workTeamSaveErrorMessage,
} from "./work-team-save";

const base = {
  name: "Equipo Norte",
  description: "Desc",
  employeeIds: ["b", "a"],
};

describe("work-team-save", () => {
  it("normalizes and compares employee id sets", () => {
    assert.deepEqual(normalizeEmployeeIds(["b", " a ", "b", ""]), ["a", "b"]);
    assert.equal(areEmployeeIdSetsEqual(["a", "b"], ["b", "a"]), true);
    assert.equal(areEmployeeIdSetsEqual(["a"], ["a", "b"]), false);
  });

  it("plans no-op when nothing changed", () => {
    assert.deepEqual(planWorkTeamSave(base, { ...base, employeeIds: ["a", "b"] }), {
      profileChanged: false,
      membersChanged: false,
    });
  });

  it("plans profile-only and members-only changes", () => {
    assert.deepEqual(
      planWorkTeamSave(base, { ...base, name: "Otro", employeeIds: ["a", "b"] }),
      { profileChanged: true, membersChanged: false },
    );
    assert.deepEqual(
      planWorkTeamSave(base, { ...base, employeeIds: ["a", "c"] }),
      { profileChanged: false, membersChanged: true },
    );
  });

  it("skips mutations when there are no changes", async () => {
    let updates = 0;
    let replaces = 0;
    const result = await executeWorkTeamSave(base, { ...base, employeeIds: ["a", "b"] }, {
      updateProfile: async () => {
        updates += 1;
      },
      replaceMembers: async () => {
        replaces += 1;
      },
    });
    assert.equal(result.status, "noop");
    assert.equal(updates, 0);
    assert.equal(replaces, 0);
  });

  it("updates profile only", async () => {
    const calls: string[] = [];
    const result = await executeWorkTeamSave(base, { ...base, name: "Nuevo", employeeIds: ["a", "b"] }, {
      updateProfile: async () => {
        calls.push("profile");
      },
      replaceMembers: async () => {
        calls.push("members");
      },
    });
    assert.equal(result.status, "success");
    assert.deepEqual(calls, ["profile"]);
  });

  it("replaces members only", async () => {
    const calls: string[] = [];
    const result = await executeWorkTeamSave(base, { ...base, employeeIds: ["c"] }, {
      updateProfile: async () => {
        calls.push("profile");
      },
      replaceMembers: async () => {
        calls.push("members");
      },
    });
    assert.equal(result.status, "success");
    assert.deepEqual(calls, ["members"]);
  });

  it("runs both profile and members", async () => {
    const calls: string[] = [];
    const result = await executeWorkTeamSave(
      base,
      { name: "Nuevo", description: "X", employeeIds: ["z"] },
      {
        updateProfile: async () => {
          calls.push("profile");
        },
        replaceMembers: async () => {
          calls.push("members");
        },
      },
    );
    assert.equal(result.status, "success");
    assert.deepEqual(calls, ["profile", "members"]);
  });

  it("does not replace members when profile update fails", async () => {
    let replaces = 0;
    const result = await executeWorkTeamSave(
      base,
      { name: "Nuevo", description: base.description, employeeIds: ["z"] },
      {
        updateProfile: async () => {
          throw new Error("profile boom");
        },
        replaceMembers: async () => {
          replaces += 1;
        },
      },
    );
    assert.equal(result.status, "profile_failed");
    assert.equal(replaces, 0);
  });

  it("reports honest partial failure when members fail after profile", async () => {
    const result = await executeWorkTeamSave(
      base,
      { name: "Nuevo", description: base.description, employeeIds: ["z"] },
      {
        updateProfile: async () => undefined,
        replaceMembers: async () => {
          throw new Error("members boom");
        },
      },
    );
    assert.equal(result.status, "members_failed_after_profile");
    assert.equal(result.profileUpdated, true);
    assert.match(workTeamSaveErrorMessage(result, "fallback"), /integrantes/i);
  });

  it("ignores overlapping double-submit at executor level via sequential awaits", async () => {
    let profiles = 0;
    const first = executeWorkTeamSave(base, { ...base, name: "A", employeeIds: ["a", "b"] }, {
      updateProfile: async () => {
        profiles += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
      replaceMembers: async () => undefined,
    });
    const second = executeWorkTeamSave(base, { ...base, name: "B", employeeIds: ["a", "b"] }, {
      updateProfile: async () => {
        profiles += 1;
      },
      replaceMembers: async () => undefined,
    });
    await Promise.all([first, second]);
    assert.equal(profiles, 2);
  });
});
