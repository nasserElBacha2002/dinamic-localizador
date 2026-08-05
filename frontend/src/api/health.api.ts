import { apiClient } from "./client";
import type { ApiHealthResponse } from "../types/health";

/** Public liveness probe only. Detailed diagnostics use platform/servers/status. */
export async function getApiHealth(): Promise<ApiHealthResponse> {
  const { data } = await apiClient.get<ApiHealthResponse>("health");
  return data;
}
