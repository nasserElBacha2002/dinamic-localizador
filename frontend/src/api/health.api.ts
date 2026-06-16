import type { ApiHealthResponse, DatabaseHealthResponse } from "../types/health";
import { apiClient } from "./client";

export async function getApiHealth(): Promise<ApiHealthResponse> {
  const { data } = await apiClient.get<ApiHealthResponse>("/health");
  return data;
}

export async function getDatabaseHealth(): Promise<DatabaseHealthResponse> {
  const { data } = await apiClient.get<DatabaseHealthResponse>("/health/database");
  return data;
}
