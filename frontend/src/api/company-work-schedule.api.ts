import type { SingleResponse } from "../types/api";
import type { CompanyWorkSchedule, WeeklyScheduleDay } from "../types/schedule";
import { scopedApiClient } from "./scoped-client";

export async function getCompanyWorkSchedule(): Promise<CompanyWorkSchedule> {
  const { data } = await scopedApiClient.get<SingleResponse<CompanyWorkSchedule>>(
    "settings/work-schedule",
  );
  return data.data;
}

export async function updateCompanyWorkSchedule(input: {
  timezone: string;
  days: WeeklyScheduleDay[];
}): Promise<CompanyWorkSchedule> {
  const { data } = await scopedApiClient.put<SingleResponse<CompanyWorkSchedule>>(
    "settings/work-schedule",
    input,
  );
  return data.data;
}
