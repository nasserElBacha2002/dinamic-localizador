import { useQuery } from "@tanstack/react-query";
import { getApiHealth, getDatabaseHealth } from "../api/health.api";

export function useApiHealth() {
  return useQuery({
    queryKey: ["api-health"],
    queryFn: getApiHealth,
    refetchInterval: 15000,
  });
}

export function useDatabaseHealth() {
  return useQuery({
    queryKey: ["database-health"],
    queryFn: getDatabaseHealth,
    refetchInterval: 15000,
  });
}
