import { createHash } from "node:crypto";

export const hashWorkTeamMembers = (employeeIds: string[]): string => {
  const normalized = [...new Set(employeeIds)].sort();
  return createHash("sha256").update(normalized.join("|")).digest("hex");
};

export const hashCombinedWorkTeamSnapshots = (hashes: string[]): string => {
  const normalized = [...hashes].sort();
  return createHash("sha256").update(normalized.join("|")).digest("hex");
};
