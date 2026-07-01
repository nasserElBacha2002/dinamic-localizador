import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../utils/errors";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.code === "COMPANY_SELECTION_REQUIRED") {
          return false;
        }

        return failureCount < 1;
      },
    },
  },
});
