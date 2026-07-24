import type { SingleResponse } from "../types/api";
import type {
  CreateEmployeeCategoryInput,
  EmployeeCategory,
  ListEmployeeCategoriesFilters,
  UpdateEmployeeCategoryInput,
} from "../types/employee-category";
import { buildParams } from "./client";
import { scopedApiClient } from "./scoped-client";

export async function getEmployeeCategories(
  filters: ListEmployeeCategoriesFilters = {},
): Promise<EmployeeCategory[]> {
  const { data } = await scopedApiClient.get<SingleResponse<EmployeeCategory[]>>(
    "employee-categories",
    {
      params: buildParams({
        includeInactive: filters.includeInactive ? "true" : undefined,
      }),
    },
  );
  return data.data;
}

export async function createEmployeeCategory(
  input: CreateEmployeeCategoryInput,
): Promise<EmployeeCategory> {
  const { data } = await scopedApiClient.post<SingleResponse<EmployeeCategory>>(
    "employee-categories",
    input,
  );
  return data.data;
}

export async function updateEmployeeCategory(
  categoryId: string,
  input: UpdateEmployeeCategoryInput,
): Promise<EmployeeCategory> {
  const { data } = await scopedApiClient.patch<SingleResponse<EmployeeCategory>>(
    `employee-categories/${categoryId}`,
    input,
  );
  return data.data;
}
