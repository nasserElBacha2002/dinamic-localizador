import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addOperationShiftVersion,
  createOperationShift,
  deactivateOperationShift,
  listOperationShifts,
  patchOperationShift,
  transitionOperationToMultiShift,
  transitionOperationToSingle,
  upsertOperationShiftException,
} from "../api/operation-shifts.api";
import { operationShiftKeys } from "../queryKeys/operation-shifts";
import { operationKeys, operationWorkdayKeys } from "../queryKeys/operations";
import type {
  CreateOperationShiftVersionInput,
  CreateOperationShiftWithInitialVersionInput,
  TransitionToMultiShiftInput,
  TransitionToSingleInput,
  UpdateOperationShiftInput,
  UpsertShiftDateExceptionInput,
} from "../types/operation-shift";
import { requireCompanyId } from "./require-company-id";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

async function invalidateOperationShiftScopedQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | undefined,
  operationId: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: operationShiftKeys.lists(companyId, operationId),
    }),
    queryClient.invalidateQueries({ queryKey: operationKeys.detail(companyId, operationId) }),
    queryClient.invalidateQueries({
      queryKey: operationWorkdayKeys.list(companyId, operationId),
    }),
  ]);
}

export function useOperationShifts(
  operationId: string | undefined,
  filters: { activeOnly?: boolean } = {},
  extraEnabled = true,
) {
  const { companyId, enabled } = useOperationalQueryEnabled(
    Boolean(operationId) && extraEnabled,
  );

  return useQuery({
    queryKey: operationShiftKeys.list(companyId, operationId, filters),
    queryFn: ({ signal }) =>
      listOperationShifts(operationId!, {
        ...filters,
        signal,
        scopeCompanyId: requireCompanyId(companyId),
      }),
    enabled,
    retry: 1,
  });
}

export function useCreateOperationShift(operationId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: CreateOperationShiftWithInitialVersionInput) =>
      createOperationShift(operationId, input, {
        scopeCompanyId: requireCompanyId(companyId),
      }),
    onSuccess: async () => {
      await invalidateOperationShiftScopedQueries(queryClient, companyId, operationId);
    },
  });
}

export function useUpdateOperationShift(operationId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: ({ shiftId, input }: { shiftId: string; input: UpdateOperationShiftInput }) =>
      patchOperationShift(operationId, shiftId, input, {
        scopeCompanyId: requireCompanyId(companyId),
      }),
    onSuccess: async () => {
      await invalidateOperationShiftScopedQueries(queryClient, companyId, operationId);
    },
  });
}

export function useDeactivateOperationShift(operationId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (shiftId: string) =>
      deactivateOperationShift(operationId, shiftId, {
        scopeCompanyId: requireCompanyId(companyId),
      }),
    onSuccess: async () => {
      await invalidateOperationShiftScopedQueries(queryClient, companyId, operationId);
    },
  });
}

export function useAddOperationShiftVersion(operationId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: ({
      shiftId,
      input,
    }: {
      shiftId: string;
      input: CreateOperationShiftVersionInput;
    }) =>
      addOperationShiftVersion(operationId, shiftId, input, {
        scopeCompanyId: requireCompanyId(companyId),
      }),
    onSuccess: async () => {
      await invalidateOperationShiftScopedQueries(queryClient, companyId, operationId);
    },
  });
}

export function useUpsertOperationShiftException(operationId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: ({
      shiftId,
      input,
    }: {
      shiftId: string;
      input: UpsertShiftDateExceptionInput;
    }) =>
      upsertOperationShiftException(operationId, shiftId, input, {
        scopeCompanyId: requireCompanyId(companyId),
      }),
    onSuccess: async () => {
      await invalidateOperationShiftScopedQueries(queryClient, companyId, operationId);
    },
  });
}

export function useTransitionOperationToMultiShift(operationId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: TransitionToMultiShiftInput) =>
      transitionOperationToMultiShift(operationId, input, {
        scopeCompanyId: requireCompanyId(companyId),
      }),
    onSuccess: async () => {
      await invalidateOperationShiftScopedQueries(queryClient, companyId, operationId);
      await queryClient.invalidateQueries({ queryKey: operationKeys.list(companyId) });
    },
  });
}

export function useTransitionOperationToSingle(operationId: string) {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: TransitionToSingleInput) =>
      transitionOperationToSingle(operationId, input, {
        scopeCompanyId: requireCompanyId(companyId),
      }),
    onSuccess: async () => {
      await invalidateOperationShiftScopedQueries(queryClient, companyId, operationId);
      await queryClient.invalidateQueries({ queryKey: operationKeys.list(companyId) });
    },
  });
}
