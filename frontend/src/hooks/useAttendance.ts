import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAttendanceRecord,
  exportAttendanceCsv,
  getAttendanceById,
  getAttendanceRecords,
  getAttendanceReviews,
  reviewAttendanceRecord,
} from "../api/attendance.api";
import type { AttendanceFilters, ReviewAttendanceInput } from "../types/attendance";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useAttendanceRecords(filters: AttendanceFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: ["attendance", companyId, filters],
    queryFn: () => getAttendanceRecords(filters),
    enabled,
    retry: 1,
  });
}

export function useAttendanceRecord(attendanceId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(attendanceId));

  return useQuery({
    queryKey: ["attendance-record", companyId, attendanceId],
    queryFn: () => getAttendanceById(attendanceId!),
    enabled,
  });
}

export function useCreateAttendanceRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createAttendanceRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["operations"] });
      queryClient.invalidateQueries({ queryKey: ["operation"] });
      queryClient.invalidateQueries({ queryKey: ["operation-attendance-summary"] });
    },
  });
}

export function useReviewAttendanceRecord(attendanceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReviewAttendanceInput) => reviewAttendanceRecord(attendanceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-record"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-reviews"] });
      queryClient.invalidateQueries({ queryKey: ["operation-attendance-summary"] });
    },
  });
}

export function useReviewAttendance() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      attendanceId,
      input,
    }: {
      attendanceId: string;
      input: ReviewAttendanceInput;
    }) => reviewAttendanceRecord(attendanceId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-record", variables.attendanceId] });
      queryClient.invalidateQueries({ queryKey: ["attendance-reviews", variables.attendanceId] });
      queryClient.invalidateQueries({ queryKey: ["operation-attendance-summary"] });
    },
  });
}

export function useAttendanceReviews(attendanceId?: string, page = 1, limit = 10) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(attendanceId));

  return useQuery({
    queryKey: ["attendance-reviews", companyId, attendanceId, page, limit],
    queryFn: () => getAttendanceReviews(attendanceId!, page, limit),
    enabled,
  });
}

export function useExportAttendanceCsv() {
  return useMutation({
    mutationFn: exportAttendanceCsv,
  });
}
