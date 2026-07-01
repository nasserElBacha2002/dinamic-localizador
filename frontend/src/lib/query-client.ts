import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import {
  ACTIVE_COMPANY_REQUIRED,
  ActiveCompanyRequiredError,
  notifyCompanySelectionRequired,
} from "../api/company-path";
import { ApiError } from "../utils/errors";

const shouldNotRetry = (error: unknown): boolean => {
  if (error instanceof ActiveCompanyRequiredError) {
    return true;
  }

  if (error instanceof ApiError) {
    return error.code === "COMPANY_SELECTION_REQUIRED" || error.code === ACTIVE_COMPANY_REQUIRED;
  }

  return false;
};

const handleQueryError = (error: unknown): void => {
  if (error instanceof ActiveCompanyRequiredError) {
    notifyCompanySelectionRequired();
  }
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleQueryError,
  }),
  mutationCache: new MutationCache({
    onError: handleQueryError,
  }),
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (shouldNotRetry(error)) {
          return false;
        }

        return failureCount < 1;
      },
    },
    mutations: {
      retry: (failureCount, error) => {
        if (shouldNotRetry(error)) {
          return false;
        }

        return failureCount < 1;
      },
    },
  },
});
