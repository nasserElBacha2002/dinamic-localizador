import { useQuery } from "@tanstack/react-query";
import { getApiHealth, getDatabaseHealth } from "../services/health-service";

export const useApiHealth = () =>
  useQuery({
    queryKey: ["api-health"],
    queryFn: getApiHealth,
    refetchInterval: 15000,
  });

export const useDatabaseHealth = () =>
  useQuery({
    queryKey: ["database-health"],
    queryFn: getDatabaseHealth,
    refetchInterval: 15000,
  });
