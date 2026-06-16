import type { PaginatedResponse, SingleResponse } from "../types/api";
import type {
  AttendanceDetail,
  AttendanceFilters,
  AttendanceRecord,
  AttendanceRecordWithRelations,
  CreateAttendanceInput,
  ReviewAttendanceInput,
} from "../types/attendance";
import { apiClient, buildParams } from "./client";

export async function getAttendanceRecords(
  filters: AttendanceFilters = {},
): Promise<PaginatedResponse<AttendanceRecordWithRelations>> {
  const { data } = await apiClient.get<PaginatedResponse<AttendanceRecordWithRelations>>("/attendance", {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
  });
  return data;
}

export async function getAttendanceById(id: string): Promise<AttendanceDetail> {
  const { data } = await apiClient.get<SingleResponse<AttendanceDetail>>(`/attendance/${id}`);
  return data.data;
}

export async function createAttendanceRecord(input: CreateAttendanceInput): Promise<AttendanceRecord> {
  const { data } = await apiClient.post<SingleResponse<AttendanceRecord>>("/attendance", input);
  return data.data;
}

export async function reviewAttendanceRecord(
  id: string,
  input: ReviewAttendanceInput,
): Promise<AttendanceDetail> {
  const { data } = await apiClient.patch<SingleResponse<AttendanceDetail>>(`/attendance/${id}/review`, input);
  return data.data;
}

export async function exportAttendanceCsv(filters: AttendanceFilters = {}): Promise<Blob> {
  const response = await apiClient.get<Blob>("/attendance/export.csv", {
    params: buildParams(filters as Record<string, string | number | boolean | undefined>),
    responseType: "blob",
  });
  return response.data;
}
