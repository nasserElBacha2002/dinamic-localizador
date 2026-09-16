import { createHash } from "node:crypto";

export const hashWorkTeamMembers = (employeeIds: string[]): string => {
  const normalized = [...new Set(employeeIds)].sort();
  return createHash("sha256").update(normalized.join("|")).digest("hex");
};

export const hashCombinedWorkTeamSnapshots = (hashes: string[]): string => {
  const normalized = [...hashes].sort();
  return createHash("sha256").update(normalized.join("|")).digest("hex");
};

/** Fingerprint for preview batch: shift id (or empty) + team member hashes. */
export const hashWorkTeamPreviewSnapshot = (
  operationShiftId: string | null,
  teamHashes: string[],
): string => {
  const shiftPart = operationShiftId ?? "";
  const teamPart = hashCombinedWorkTeamSnapshots(teamHashes);
  return createHash("sha256").update(`${shiftPart}|${teamPart}`).digest("hex");
};
