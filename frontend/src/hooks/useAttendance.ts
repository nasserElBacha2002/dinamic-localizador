import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAttendanceRecord,
  exportAttendanceCsv,
  getAttendanceById,
  getAttendanceRecords,
  getAttendanceReviews,
  reviewAttendanceRecord,
} from "../api/attendance.api";
import type {
  CreateAttendanceInput,
  AttendanceFilters,
  ReviewAttendanceInput,
} from "../types/attendance";
import { attendanceKeys } from "../queryKeys/attendance";
import { invalidateAttendanceReviewQueries } from "../queryKeys/invalidation";
import { operationAttendanceKeys, operationKeys } from "../queryKeys/operations";
import { requireCompanyId } from "./require-company-id";
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
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();

  const mutation = useMutation({
    mutationFn: ({
      companyId,
      input,
    }: {
      companyId: string;
      input: CreateAttendanceInput;
    }) => createAttendanceRecord(input, { scopeCompanyId: companyId }),
    onSuccess: async (_data, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: attendanceKeys.lists(variables.companyId) }),
        queryClient.invalidateQueries({ queryKey: operationKeys.list(variables.companyId) }),
        queryClient.invalidateQueries({
          queryKey: operationKeys.details(variables.companyId),
        }),
        queryClient.invalidateQueries({
          queryKey: operationAttendanceKeys.company(variables.companyId),
        }),
      ]);
    },
  });

  return {
    ...mutation,
    mutate: (
      input: CreateAttendanceInput,
      options?: Parameters<typeof mutation.mutate>[1],
    ) => {
      mutation.mutate({ companyId: requireCompanyId(activeCompanyId), input }, options);
    },
    mutateAsync: (
      input: CreateAttendanceInput,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) =>
      mutation.mutateAsync({ companyId: requireCompanyId(activeCompanyId), input }, options),
  };
}

export function useReviewAttendanceRecord(attendanceId: string) {
  const queryClient = useQueryClient();
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();

  const mutation = useMutation({
    mutationFn: ({
      companyId,
      input,
    }: {
      companyId: string;
      input: ReviewAttendanceInput;
    }) => reviewAttendanceRecord(attendanceId, input, { scopeCompanyId: companyId }),
    onSuccess: async (_data, variables) => {
      await invalidateAttendanceReviewQueries(queryClient, variables.companyId, attendanceId);
    },
  });

  return {
    ...mutation,
    mutate: (
      input: ReviewAttendanceInput,
      options?: Parameters<typeof mutation.mutate>[1],
    ) => {
      mutation.mutate({ companyId: requireCompanyId(activeCompanyId), input }, options);
    },
    mutateAsync: (
      input: ReviewAttendanceInput,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) =>
      mutation.mutateAsync({ companyId: requireCompanyId(activeCompanyId), input }, options),
  };
}

export function useReviewAttendance() {
  const queryClient = useQueryClient();
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();

  const mutation = useMutation({
    mutationFn: ({
      companyId,
      attendanceId,
      input,
    }: {
      companyId: string;
      attendanceId: string;
      input: ReviewAttendanceInput;
    }) => reviewAttendanceRecord(attendanceId, input, { scopeCompanyId: companyId }),
    onSuccess: async (_data, variables) => {
      await invalidateAttendanceReviewQueries(
        queryClient,
        variables.companyId,
        variables.attendanceId,
      );
    },
  });

  return {
    ...mutation,
    mutate: (
      variables: { attendanceId: string; input: ReviewAttendanceInput },
      options?: Parameters<typeof mutation.mutate>[1],
    ) => {
      mutation.mutate(
        { companyId: requireCompanyId(activeCompanyId), ...variables },
        options,
      );
    },
    mutateAsync: (
      variables: { attendanceId: string; input: ReviewAttendanceInput },
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) =>
      mutation.mutateAsync(
        { companyId: requireCompanyId(activeCompanyId), ...variables },
        options,
      ),
  };
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
