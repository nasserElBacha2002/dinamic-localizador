import type { SingleResponse } from "../types/api";
import type {
  CompanyShiftTemplate,
  CreateCompanyShiftTemplateInput,
  CreateOperationShiftVersionInput,
  CreateOperationShiftWithInitialVersionInput,
  OperationShift,
  OperationShiftVersion,
  OperationShiftWithVersions,
  ShiftDateException,
  TransitionToMultiShiftInput,
  TransitionToMultiShiftResult,
  TransitionToSingleInput,
  TransitionToSingleResult,
  UpdateCompanyShiftTemplateInput,
  UpdateOperationShiftInput,
  UpsertShiftDateExceptionInput,
} from "../types/operation-shift";
import { buildParams } from "./client";
import {
  operationScheduleModeMultiPath,
  operationScheduleModeSinglePath,
  operationShiftExceptionsPath,
  operationShiftPath,
  operationShiftsPath,
  operationShiftVersionsPath,
  shiftTemplatePath,
  shiftTemplatesPath,
} from "./endpoints";
import { scopedApiClient, type ScopedAxiosRequestConfig } from "./scoped-client";

export type ShiftTemplatesRequestOptions = Pick<
  ScopedAxiosRequestConfig,
  "signal" | "scopeCompanyId"
> & {
  activeOnly?: boolean;
};

export type OperationShiftsRequestOptions = Pick<
  ScopedAxiosRequestConfig,
  "signal" | "scopeCompanyId"
> & {
  activeOnly?: boolean;
};

export type ShiftMutationOptions = Pick<ScopedAxiosRequestConfig, "scopeCompanyId">;

export async function listShiftTemplates(
  options?: ShiftTemplatesRequestOptions,
): Promise<CompanyShiftTemplate[]> {
  const { data } = await scopedApiClient.get<SingleResponse<CompanyShiftTemplate[]>>(
    shiftTemplatesPath(),
    {
      params: buildParams({
        activeOnly: options?.activeOnly === undefined ? undefined : String(options.activeOnly),
      }),
      signal: options?.signal,
      scopeCompanyId: options?.scopeCompanyId,
    },
  );
  return data.data;
}

export async function createShiftTemplate(
  input: CreateCompanyShiftTemplateInput,
  options?: ShiftMutationOptions,
): Promise<CompanyShiftTemplate> {
  const { data } = await scopedApiClient.post<SingleResponse<CompanyShiftTemplate>>(
    shiftTemplatesPath(),
    input,
    { scopeCompanyId: options?.scopeCompanyId },
  );
  return data.data;
}

export async function patchShiftTemplate(
  templateId: string,
  input: UpdateCompanyShiftTemplateInput,
  options?: ShiftMutationOptions,
): Promise<CompanyShiftTemplate> {
  const { data } = await scopedApiClient.patch<SingleResponse<CompanyShiftTemplate>>(
    shiftTemplatePath(templateId),
    input,
    { scopeCompanyId: options?.scopeCompanyId },
  );
  return data.data;
}

export async function deactivateShiftTemplate(
  templateId: string,
  options?: ShiftMutationOptions,
): Promise<CompanyShiftTemplate> {
  const { data } = await scopedApiClient.delete<SingleResponse<CompanyShiftTemplate>>(
    shiftTemplatePath(templateId),
    { scopeCompanyId: options?.scopeCompanyId },
  );
  return data.data;
}

export async function listOperationShifts(
  operationId: string,
  options?: OperationShiftsRequestOptions,
): Promise<OperationShiftWithVersions[]> {
  const { data } = await scopedApiClient.get<SingleResponse<OperationShiftWithVersions[]>>(
    operationShiftsPath(operationId),
    {
      params: buildParams({
        activeOnly: options?.activeOnly === undefined ? undefined : String(options.activeOnly),
      }),
      signal: options?.signal,
      scopeCompanyId: options?.scopeCompanyId,
    },
  );
  return data.data;
}

export async function createOperationShift(
  operationId: string,
  input: CreateOperationShiftWithInitialVersionInput,
  options?: ShiftMutationOptions,
): Promise<OperationShiftWithVersions> {
  const { data } = await scopedApiClient.post<SingleResponse<OperationShiftWithVersions>>(
    operationShiftsPath(operationId),
    input,
    { scopeCompanyId: options?.scopeCompanyId },
  );
  return data.data;
}

export async function patchOperationShift(
  operationId: string,
  shiftId: string,
  input: UpdateOperationShiftInput,
  options?: ShiftMutationOptions,
): Promise<OperationShift> {
  const { data } = await scopedApiClient.patch<SingleResponse<OperationShift>>(
    operationShiftPath(operationId, shiftId),
    input,
    { scopeCompanyId: options?.scopeCompanyId },
  );
  return data.data;
}

export async function deactivateOperationShift(
  operationId: string,
  shiftId: string,
  options?: ShiftMutationOptions,
): Promise<OperationShift> {
  const { data } = await scopedApiClient.delete<SingleResponse<OperationShift>>(
    operationShiftPath(operationId, shiftId),
    { scopeCompanyId: options?.scopeCompanyId },
  );
  return data.data;
}

export async function addOperationShiftVersion(
  operationId: string,
  shiftId: string,
  input: CreateOperationShiftVersionInput,
  options?: ShiftMutationOptions,
): Promise<OperationShiftVersion> {
  const { data } = await scopedApiClient.post<SingleResponse<OperationShiftVersion>>(
    operationShiftVersionsPath(operationId, shiftId),
    input,
    { scopeCompanyId: options?.scopeCompanyId },
  );
  return data.data;
}

export async function upsertOperationShiftException(
  operationId: string,
  shiftId: string,
  input: UpsertShiftDateExceptionInput,
  options?: ShiftMutationOptions,
): Promise<{
  exception: ShiftDateException;
  workday: {
    id: string;
    status: string;
    cancellationReason: string | null;
    workDate: string;
    operationShiftId: string | null;
    expectedStartAt: string;
    expectedEndAt: string | null;
  } | null;
}> {
  const { data } = await scopedApiClient.post<
    SingleResponse<{
      exception: ShiftDateException;
      workday: {
        id: string;
        status: string;
        cancellationReason: string | null;
        workDate: string;
        operationShiftId: string | null;
        expectedStartAt: string;
        expectedEndAt: string | null;
      } | null;
    }>
  >(operationShiftExceptionsPath(operationId, shiftId), input, {
    scopeCompanyId: options?.scopeCompanyId,
  });
  return data.data;
}

export async function transitionOperationToMultiShift(
  operationId: string,
  input: TransitionToMultiShiftInput,
  options?: ShiftMutationOptions,
): Promise<TransitionToMultiShiftResult> {
  const { data } = await scopedApiClient.post<SingleResponse<TransitionToMultiShiftResult>>(
    operationScheduleModeMultiPath(operationId),
    input,
    { scopeCompanyId: options?.scopeCompanyId },
  );
  return data.data;
}

export async function transitionOperationToSingle(
  operationId: string,
  input: TransitionToSingleInput,
  options?: ShiftMutationOptions,
): Promise<TransitionToSingleResult> {
  const { data } = await scopedApiClient.post<SingleResponse<TransitionToSingleResult>>(
    operationScheduleModeSinglePath(operationId),
    input,
    { scopeCompanyId: options?.scopeCompanyId },
  );
  return data.data;
}
