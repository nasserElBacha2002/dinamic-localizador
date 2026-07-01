import type { AxiosRequestConfig, AxiosResponse } from "axios";
import { apiClient } from "./client";
import { scopedApiPath } from "./company-path";

export const scopedApiClient = {
  get<T>(path: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return apiClient.get<T>(scopedApiPath(path), config);
  },

  post<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return apiClient.post<T>(scopedApiPath(path), data, config);
  },

  put<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return apiClient.put<T>(scopedApiPath(path), data, config);
  },

  patch<T>(path: string, data?: unknown, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return apiClient.patch<T>(scopedApiPath(path), data, config);
  },

  delete<T>(path: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return apiClient.delete<T>(scopedApiPath(path), config);
  },
};
