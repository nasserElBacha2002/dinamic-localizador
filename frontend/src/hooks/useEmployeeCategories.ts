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
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

export const employeeCategoriesQueryKey = (
  companyId: string | undefined,
  filters: ListEmployeeCategoriesFilters,
) => ["employee-categories", companyId, filters] as const;

export function useEmployeeCategories(
  filters: ListEmployeeCategoriesFilters = {},
  extraEnabled = true,
) {
  const { companyId, enabled } = useOperationalQueryEnabled(extraEnabled);

  return useQuery({
    queryKey: employeeCategoriesQueryKey(companyId, filters),
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["employee-categories", companyId] });
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["employee-categories", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["employees", companyId] });
    },
  });
}
