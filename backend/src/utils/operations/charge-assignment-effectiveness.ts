import type { OperationChargeAssignment } from "../../types/operation-charge";
import { resolveAssignmentLifecycleState } from "./assignment-period";

/** True when the row still conveys operational authority (current or future), not historical. */
export const isChargeAssignmentOperationallyEffective = (
  assignment: Pick<OperationChargeAssignment, "validFrom" | "validUntil" | "cancelledAt">,
  referenceDate: string,
): boolean => {
  const lifecycle = resolveAssignmentLifecycleState(assignment, referenceDate);
  return lifecycle === "CURRENT" || lifecycle === "FUTURE";
};
