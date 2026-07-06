export const SCHEDULE_SOURCES = ["COMPANY", "CUSTOM"] as const;

export type ScheduleSource = (typeof SCHEDULE_SOURCES)[number];
