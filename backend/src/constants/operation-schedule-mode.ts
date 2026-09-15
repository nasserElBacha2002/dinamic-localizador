export const OPERATION_SCHEDULE_MODES = ["SINGLE", "MULTI_SHIFT"] as const;

export type OperationScheduleMode = (typeof OPERATION_SCHEDULE_MODES)[number];

export const DEFAULT_OPERATION_SCHEDULE_MODE: OperationScheduleMode = "SINGLE";

export const isOperationScheduleMode = (value: unknown): value is OperationScheduleMode =>
  typeof value === "string" &&
  (OPERATION_SCHEDULE_MODES as readonly string[]).includes(value);
