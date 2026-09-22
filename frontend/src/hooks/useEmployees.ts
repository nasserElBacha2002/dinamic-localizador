import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEmployee,
  deactivateEmployee,
  getEmployeeById,
  getEmployees,
  updateEmployee,
  getEmployeeClients,
  replaceEmployeeClients,
} from "../api/employees.api";
import { clientEmployeesQueryKey } from "./useClients";
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

export const employeeClientsQueryKey = (companyId: string | undefined, employeeId: string | undefined) =>
  ["employee-clients", companyId, employeeId] as const;

export function useEmployeeClients(employeeId?: string) {
  const { companyId, enabled } = useOperationalQueryEnabled(Boolean(employeeId));
  return useQuery({
    queryKey: employeeClientsQueryKey(companyId, employeeId),
    queryFn: () => getEmployeeClients(employeeId!, { scopeCompanyId: requireCompanyId(companyId) }),
    enabled,
  });
}

export function useReplaceEmployeeClients(employeeId?: string) {
  const queryClient = useQueryClient();
  const { companyId: activeCompanyId } = useOperationalQueryEnabled();
  const mutation = useMutation({
    mutationFn: ({ companyId, clientIds, targetEmployeeId }: { companyId: string; clientIds: string[]; targetEmployeeId: string }) =>
      replaceEmployeeClients(targetEmployeeId, clientIds, { scopeCompanyId: companyId }),
    onSuccess: async (_result, { companyId, clientIds, targetEmployeeId }) => {
      const previous = queryClient.getQueryData<{ id: string }[]>(employeeClientsQueryKey(companyId, targetEmployeeId)) ?? [];
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeClientsQueryKey(companyId, targetEmployeeId) }),
        ...[...new Set([...previous.map((client) => client.id), ...clientIds])].map((clientId) =>
          queryClient.invalidateQueries({ queryKey: clientEmployeesQueryKey(companyId, clientId) }),
        ),
      ]);
    },
  });
  return {
    ...mutation,
    mutateAsync: (
      clientIds: string[],
      targetEmployeeId = employeeId,
      options?: Parameters<typeof mutation.mutateAsync>[1],
    ) => {
      if (!targetEmployeeId) throw new Error("EMPLOYEE_ID_REQUIRED");
      return mutation.mutateAsync({ companyId: requireCompanyId(activeCompanyId), clientIds, targetEmployeeId }, options);
    },
  };
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
