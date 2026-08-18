import type { WorkTeamFormValues } from "../components/work-teams/work-team-form.types";

export type { WorkTeamFormValues };

export function normalizeEmployeeIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}

export function areEmployeeIdSetsEqual(a: readonly string[], b: readonly string[]): boolean {
  const left = normalizeEmployeeIds(a);
  const right = normalizeEmployeeIds(b);
  if (left.length !== right.length) {
    return false;
  }
  return left.every((id, index) => id === right[index]);
}

export interface WorkTeamSavePlan {
  profileChanged: boolean;
  membersChanged: boolean;
}

export function planWorkTeamSave(
  initial: WorkTeamFormValues,
  next: WorkTeamFormValues,
): WorkTeamSavePlan {
  return {
    profileChanged:
      next.name.trim() !== initial.name.trim() ||
      (next.description ?? "").trim() !== (initial.description ?? "").trim(),
    membersChanged: !areEmployeeIdSetsEqual(initial.employeeIds, next.employeeIds),
  };
}

export type WorkTeamSaveStatus =
  | "noop"
  | "success"
  | "profile_failed"
  | "members_failed_after_profile";

export interface WorkTeamSaveResult {
  status: WorkTeamSaveStatus;
  profileUpdated: boolean;
  membersUpdated: boolean;
  error?: unknown;
}

export interface WorkTeamSaveExecutors {
  updateProfile: (input: { name: string; description: string | null }) => Promise<unknown>;
  replaceMembers: (employeeIds: string[]) => Promise<unknown>;
}

/**
 * Sequential profile → members save without inventing a frontend transaction.
 * Skips mutations that are not needed; reports partial failure honestly.
 */
export async function executeWorkTeamSave(
  initial: WorkTeamFormValues,
  next: WorkTeamFormValues,
  executors: WorkTeamSaveExecutors,
): Promise<WorkTeamSaveResult> {
  const plan = planWorkTeamSave(initial, next);

  if (!plan.profileChanged && !plan.membersChanged) {
    return { status: "noop", profileUpdated: false, membersUpdated: false };
  }

  let profileUpdated = false;

  if (plan.profileChanged) {
    try {
      await executors.updateProfile({
        name: next.name.trim(),
        description: next.description.trim() ? next.description.trim() : null,
      });
      profileUpdated = true;
    } catch (error) {
      return {
        status: "profile_failed",
        profileUpdated: false,
        membersUpdated: false,
        error,
      };
    }
  }

  if (plan.membersChanged) {
    try {
      await executors.replaceMembers(normalizeEmployeeIds(next.employeeIds));
      return {
        status: "success",
        profileUpdated,
        membersUpdated: true,
      };
    } catch (error) {
      return {
        status: "members_failed_after_profile",
        profileUpdated,
        membersUpdated: false,
        error,
      };
    }
  }

  return {
    status: "success",
    profileUpdated,
    membersUpdated: false,
  };
}

export function workTeamSaveErrorMessage(result: WorkTeamSaveResult, fallback: string): string {
  if (result.status === "members_failed_after_profile" && result.profileUpdated) {
    return "Los datos del grupo se guardaron, pero no se pudieron actualizar los integrantes. Revisá e intentá de nuevo.";
  }
  return fallback;
}
