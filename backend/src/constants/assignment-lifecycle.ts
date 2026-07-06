export const ASSIGNMENT_LIFECYCLE_STATES = ["CURRENT", "FUTURE", "ENDED"] as const;

export type AssignmentLifecycleState = (typeof ASSIGNMENT_LIFECYCLE_STATES)[number];
