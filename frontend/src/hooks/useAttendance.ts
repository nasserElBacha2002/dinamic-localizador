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

export function useAttendanceRecords(filters: AttendanceFilters) {
  return useQuery({
    queryKey: ["attendance", filters],
    queryFn: () => getAttendanceRecords(filters),
    retry: 1,
  });
}

export function useAttendanceRecord(attendanceId?: string) {
  return useQuery({
    queryKey: ["attendance-record", attendanceId],
    queryFn: () => getAttendanceById(attendanceId!),
    enabled: Boolean(attendanceId),
  });
}

export function useCreateAttendanceRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createAttendanceRecord,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["inventories"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-attendance-summary"] });
    },
  });
}

export function useReviewAttendanceRecord(attendanceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ReviewAttendanceInput) => reviewAttendanceRecord(attendanceId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["attendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendance-record", attendanceId] });
      queryClient.invalidateQueries({ queryKey: ["attendance-reviews", attendanceId] });
      queryClient.invalidateQueries({ queryKey: ["inventory-attendance-summary"] });
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
      queryClient.invalidateQueries({ queryKey: ["inventory-attendance-summary"] });
    },
  });
}

export function useAttendanceReviews(attendanceId?: string, page = 1, limit = 10) {
  return useQuery({
    queryKey: ["attendance-reviews", attendanceId, page, limit],
    queryFn: () => getAttendanceReviews(attendanceId!, page, limit),
    enabled: Boolean(attendanceId),
  });
}

export function useExportAttendanceCsv() {
  return useMutation({
    mutationFn: exportAttendanceCsv,
  });
}
