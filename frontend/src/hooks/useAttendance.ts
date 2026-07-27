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
import { attendanceKeys } from "../queryKeys/attendance";
import { invalidateAttendanceReviewQueries } from "../queryKeys/invalidation";
import { operationKeys } from "../queryKeys/operations";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useAttendanceRecords(filters: AttendanceFilters) {
  const { companyId, enabled } = useOperationalQueryEnabled();

  return useQuery({
    queryKey: attendanceKeys.list(companyId, filters),
    queryFn: () => getAttendanceRecords(filters),
    enabled,
  });
}

export function useAttendanceRecord(attendanceId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(attendanceId));

  return useQuery({
    queryKey: attendanceKeys.detail(companyId, attendanceId),
    queryFn: () => getAttendanceById(attendanceId!),
    enabled,
  });
}

export function useCreateAttendanceRecord() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: createAttendanceRecord,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: attendanceKeys.lists(companyId) });
      void queryClient.invalidateQueries({ queryKey: operationKeys.list(companyId) });
      void queryClient.invalidateQueries({ queryKey: ["operation", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["operation-attendance-summary"] });
    },
  });
}

export function useReviewAttendanceRecord(attendanceId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: ReviewAttendanceInput) => reviewAttendanceRecord(attendanceId, input),
    onSuccess: () => {
      void invalidateAttendanceReviewQueries(queryClient, companyId, attendanceId);
    },
  });
}

export function useReviewAttendance() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: ({
      attendanceId,
      input,
    }: {
      attendanceId: string;
      input: ReviewAttendanceInput;
    }) => reviewAttendanceRecord(attendanceId, input),
    onSuccess: (_data, variables) => {
      void invalidateAttendanceReviewQueries(queryClient, companyId, variables.attendanceId);
    },
  });
}

export function useAttendanceReviews(attendanceId?: string, page = 1, limit = 10) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(attendanceId));

  return useQuery({
    queryKey: attendanceKeys.reviews(companyId, attendanceId, page, limit),
    queryFn: () => getAttendanceReviews(attendanceId!, page, limit),
    enabled,
  });
}

export function useExportAttendanceCsv() {
  return useMutation({
    mutationFn: exportAttendanceCsv,
  });
}
