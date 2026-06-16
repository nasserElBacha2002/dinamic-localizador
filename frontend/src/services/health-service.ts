import { httpClient } from "./http";
import type { ApiHealthResponse, DatabaseHealthResponse } from "../types/health";

export const getApiHealth = async (): Promise<ApiHealthResponse> => {
  const response = await httpClient.get<ApiHealthResponse>("/health");
  return response.data;
};

export const getDatabaseHealth = async (): Promise<DatabaseHealthResponse> => {
  const response = await httpClient.get<DatabaseHealthResponse>("/health/database");
  return response.data;
};
