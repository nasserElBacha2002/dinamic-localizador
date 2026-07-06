export const OPERATION_KINDS = ["ONE_TIME", "RECURRING"] as const;

export type OperationKind = (typeof OPERATION_KINDS)[number];
