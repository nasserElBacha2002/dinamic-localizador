import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEmployee,
  deactivateEmployee,
  getEmployeeById,
  getEmployees,
  updateEmployee,
} from "../api/employees.api";
import type {
  CreateEmployeeInput,
  EmployeeFilters,
  UpdateEmployeeInput,
} from "../types/employee";
import type { DeactivateEmployeeInput } from "../types/employee-deactivation";
import { invalidateEmployeeListAndLookupQueries } from "../queryKeys/invalidation";
import { employeeKeys } from "../queryKeys/employees";
import { requireCompanyId } from "./require-company-id";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export function useEmployees(filters: EmployeeFilters, extraEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: employeeKeys.list(companyId, filters),
    queryFn: () => getEmployees(filters),
    enabled,
  });
}

export function useEmployee(employeeId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(employeeId));

  return useQuery({
    queryKey: employeeKeys.detail(companyId, employeeId),
    queryFn: () => getEmployeeById(employeeId!),
    enabled,
  });
}

export function useCreateEmployee() {
  const queryClient = useQueryClient();
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();

  const mutation = useMutation({
    mutationFn: ({
      companyId,
      input,
    }: {
      companyId: string;
      input: CreateEmployeeInput;
    }) => createEmployee(input, { scopeCompanyId: companyId }),
    onSuccess: async (_created, variables) => {
      await invalidateEmployeeListAndLookupQueries(queryClient, variables.companyId);
    },
  });

  return {
    ...mutation,
    mutate: (
      input: CreateEmployeeInput,
      options?: Parameters<typeof mutation.mutate>[1],
    ) => {
      mutation.mutate({ companyId: requireCompanyId(activeCompanyId), input }, options);
    },
    mutateAsync: (
      input: CreateEmployeeInput,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) =>
      mutation.mutateAsync({ companyId: requireCompanyId(activeCompanyId), input }, options),
  };
}

export function useUpdateEmployee(employeeId: string) {
  const queryClient = useQueryClient();
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();

  const mutation = useMutation({
    mutationFn: ({
      companyId,
      input,
    }: {
      companyId: string;
      input: UpdateEmployeeInput;
    }) => updateEmployee(employeeId, input, { scopeCompanyId: companyId }),
    onSuccess: async (updated, variables) => {
      queryClient.setQueryData(employeeKeys.detail(variables.companyId, employeeId), updated);
      await invalidateEmployeeListAndLookupQueries(queryClient, variables.companyId);
    },
  });

  return {
    ...mutation,
    mutate: (input: UpdateEmployeeInput, options?: Parameters<typeof mutation.mutate>[1]) => {
      mutation.mutate({ companyId: requireCompanyId(activeCompanyId), input }, options);
    },
    mutateAsync: (
      input: UpdateEmployeeInput,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) =>
      mutation.mutateAsync({ companyId: requireCompanyId(activeCompanyId), input }, options),
  };
}

export function useDeactivateEmployee(employeeId: string) {
  const queryClient = useQueryClient();
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();

  const mutation = useMutation({
    mutationFn: ({
      companyId,
      input,
    }: {
      companyId: string;
      input: DeactivateEmployeeInput;
    }) => deactivateEmployee(employeeId, input, { scopeCompanyId: companyId }),
    onSuccess: async (updated, variables) => {
      queryClient.setQueryData(employeeKeys.detail(variables.companyId, employeeId), updated);
      await invalidateEmployeeListAndLookupQueries(queryClient, variables.companyId);
    },
  });

  return {
    ...mutation,
    mutate: (
      input: DeactivateEmployeeInput,
      options?: Parameters<typeof mutation.mutate>[1],
    ) => {
      mutation.mutate({ companyId: requireCompanyId(activeCompanyId), input }, options);
    },
    mutateAsync: (
      input: DeactivateEmployeeInput,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) =>
      mutation.mutateAsync({ companyId: requireCompanyId(activeCompanyId), input }, options),
  };
}
