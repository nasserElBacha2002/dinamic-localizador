import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { apiClient } from "./client";
import { scopedApiPath } from "./company-path";

export type ScopedAxiosRequestConfig = AxiosRequestConfig & {
  /** Immutable company scope for this request (survives active-company switches). */
  scopeCompanyId?: string;
};

function resolveConfig(config?: ScopedAxiosRequestConfig): AxiosRequestConfig {
  if (!config?.scopeCompanyId) {
    return config ?? {};
  }

  const { scopeCompanyId, ...rest } = config;
  void scopeCompanyId;
  return rest;
}

export const scopedApiClient = {
  get<T>(path: string, config?: ScopedAxiosRequestConfig): Promise<AxiosResponse<T>> {
    return apiClient.get<T>(scopedApiPath(path, config?.scopeCompanyId), resolveConfig(config));
  },

  post<T>(
    path: string,
    data?: unknown,
    config?: ScopedAxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return apiClient.post<T>(
      scopedApiPath(path, config?.scopeCompanyId),
      data,
      resolveConfig(config),
    );
  },

  put<T>(
    path: string,
    data?: unknown,
    config?: ScopedAxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return apiClient.put<T>(
      scopedApiPath(path, config?.scopeCompanyId),
      data,
      resolveConfig(config),
    );
  },

  patch<T>(
    path: string,
    data?: unknown,
    config?: ScopedAxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return apiClient.patch<T>(
      scopedApiPath(path, config?.scopeCompanyId),
      data,
      resolveConfig(config),
    );
  },

  delete<T>(path: string, config?: ScopedAxiosRequestConfig): Promise<AxiosResponse<T>> {
    return apiClient.delete<T>(scopedApiPath(path, config?.scopeCompanyId), resolveConfig(config));
  },
};
