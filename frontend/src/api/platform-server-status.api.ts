import { apiClient } from "./client";
import {
  parsePlatformServerStatus,
  type PlatformServerStatus,
} from "./contracts/platform-server-status";

export async function getPlatformServerStatus(): Promise<PlatformServerStatus> {
  const { data } = await apiClient.get<unknown>("platform/servers/status");
  return parsePlatformServerStatus(data);
}
