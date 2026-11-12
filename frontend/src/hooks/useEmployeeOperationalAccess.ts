import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getEmployeeOperationalAccess,
  inviteEmployeeOperationalAccess,
  linkEmployeeOperationalAccess,
  revokeEmployeeOperationalAccess,
} from "../api/employee-operational-access.api";

const queryKey = (employeeId: string) => ["employee-operational-access", employeeId] as const;

export function useEmployeeOperationalAccess(employeeId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: employeeId ? queryKey(employeeId) : ["employee-operational-access", "none"],
    queryFn: () => getEmployeeOperationalAccess(employeeId!),
    enabled: Boolean(employeeId && enabled),
  });
}

export function useLinkEmployeeOperationalAccess(employeeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => linkEmployeeOperationalAccess(employeeId, userId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKey(employeeId) }),
  });
}

export function useInviteEmployeeOperationalAccess(employeeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; inviteeName?: string | null }) =>
      inviteEmployeeOperationalAccess(employeeId, input),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKey(employeeId) }),
  });
}

export function useRevokeEmployeeOperationalAccess(employeeId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => revokeEmployeeOperationalAccess(employeeId),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKey(employeeId) }),
  });
}
