import { useQuery } from "@tanstack/react-query";
import { getApiHealth } from "../api/health.api";

/** Public process liveness only. Prefer platform server status for Super Admin diagnostics. */
export function useApiHealth() {
  return useQuery({
    queryKey: ["health", "api"],
    queryFn: getApiHealth,
    retry: false,
    refetchOnWindowFocus: false,
  });
}
