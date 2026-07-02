import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  AttendanceDetail,
  AttendanceFilters,
  AttendanceRecord,
  AttendanceRecordWithRelations,
  AttendanceReview,
  CreateAttendanceInput,
  ReviewAttendanceInput,
} from "../types/attendance";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

export async function getAttendanceRecords(
  filters: AttendanceFilters = {},
): Promise<PaginatedResponse<AttendanceRecordWithRelations>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<AttendanceRecordWithRelations>>(
    "attendance",
    {
      params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    },
  );
  return data;
}

export async function getAttendanceById(id: string): Promise<AttendanceDetail> {
  const { data } = await scopedApiClient.get<SingleResponse<AttendanceDetail>>(`attendance/${id}`);
  return data.data;
}

export async function createAttendanceRecord(input: CreateAttendanceInput): Promise<AttendanceRecord> {
  const { data } = await scopedApiClient.post<SingleResponse<AttendanceRecord>>("attendance", input);
  return data.data;
}

export async function getAttendanceReviews(
  id: string,
  page = 1,
  limit = 10,
): Promise<PaginatedResponse<AttendanceReview>> {
  const { data } = await scopedApiClient.get<PaginatedResponse<AttendanceReview>>(
    `attendance/${id}/reviews`,
    {
      params: { page, limit },
    },
  );
  return data;
}

export async function reviewAttendanceRecord(
  id: string,
  input: ReviewAttendanceInput,
): Promise<AttendanceDetail> {
  const { data } = await scopedApiClient.patch<SingleResponse<AttendanceDetail>>(
    `attendance/${id}/review`,
    input,
  );
  return data.data;
}

export async function exportAttendanceCsv(filters: AttendanceFilters = {}): Promise<Blob> {
  const response = await scopedApiClient.get<Blob>("attendance/export.csv", {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    responseType: "blob",
  });
  return response.data;
}
