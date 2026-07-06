export const ASSIGNMENT_CONFIRMATION_STATUSES = ["PENDING", "CONFIRMED", "UNAVAILABLE"] as const;

export type AssignmentConfirmationStatus = (typeof ASSIGNMENT_CONFIRMATION_STATUSES)[number];
