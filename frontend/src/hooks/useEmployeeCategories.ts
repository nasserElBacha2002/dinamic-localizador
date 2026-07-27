import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createEmployeeCategory,
  getEmployeeCategories,
  updateEmployeeCategory,
} from "../api/employee-categories.api";
import type {
  CreateEmployeeCategoryInput,
  ListEmployeeCategoriesFilters,
  UpdateEmployeeCategoryInput,
} from "../types/employee-category";
import { employeeKeys } from "../queryKeys/employees";
import { employeeCategoryKeys } from "../queryKeys/employee-categories";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

/** @deprecated Prefer employeeCategoryKeys.list */
export const employeeCategoriesQueryKey = (
  companyId: string | undefined,
  filters: ListEmployeeCategoriesFilters,
) => employeeCategoryKeys.list(companyId, filters);

export function useEmployeeCategories(
  filters: ListEmployeeCategoriesFilters = {},
  extraEnabled = true,
) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: employeeCategoryKeys.list(companyId, filters),
    queryFn: () => getEmployeeCategories(filters),
    enabled,
    retry: 1,
  });
}

export function useCreateEmployeeCategory() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: (input: CreateEmployeeCategoryInput) => createEmployeeCategory(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: employeeCategoryKeys.lists(companyId) });
    },
  });
}

export function useUpdateEmployeeCategory() {
  const queryClient = useQueryClient();
  const { companyId } = useOperationalQueryEnabled();

  return useMutation({
    mutationFn: ({
      categoryId,
      input,
    }: {
      categoryId: string;
      input: UpdateEmployeeCategoryInput;
    }) => updateEmployeeCategory(categoryId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: employeeCategoryKeys.lists(companyId) }),
        queryClient.invalidateQueries({ queryKey: employeeKeys.lists(companyId) }),
      ]);
    },
  });
}
