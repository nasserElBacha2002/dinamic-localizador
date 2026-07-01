import axios from "axios";
import {
  getActiveCompanyId,
  isLegacyOperationalApiPath,
  notifyCompanySelectionRequired,
} from "./company-path";
import { getStoredToken } from "./token-storage";
import { parseApiError } from "../utils/errors";

const baseURL = import.meta.env.VITE_API_URL;

if (!baseURL) {
  throw new Error("VITE_API_URL no está configurada");
}

export const apiClient = axios.create({
  baseURL,
  timeout: 10000,
});

let unauthorizedHandler: (() => void) | null = null;

export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (import.meta.env.DEV) {
    const requestUrl = config.url ?? "";
    if (isLegacyOperationalApiPath(requestUrl)) {
      console.warn(
        `Legacy operational API route detected. Use companyApiPath instead: ${requestUrl}`,
      );
    }
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      if (error.response?.status === 401) {
        unauthorizedHandler?.();
      }

      const code = error.response?.data?.error?.code;
      const requestUrl = error.config?.url;

      if (error.response?.status === 409 && code === "COMPANY_SELECTION_REQUIRED") {
        const hasActiveCompany = Boolean(getActiveCompanyId());
        const isLegacyRoute = isLegacyOperationalApiPath(requestUrl);

        if (import.meta.env.DEV && hasActiveCompany && isLegacyRoute) {
          console.warn(
            "Ignored COMPANY_SELECTION_REQUIRED for stale legacy request while company is selected:",
            requestUrl,
          );
        } else if (!hasActiveCompany || isLegacyRoute) {
          notifyCompanySelectionRequired();
        }
      }
    }

    return Promise.reject(parseApiError(error));
  },
);

function buildParams(
  filters: Record<string, string | number | boolean | undefined>,
): Record<string, string | number> {
  const params: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") {
      continue;
    }

    if (typeof value === "boolean") {
      params[key] = value ? "true" : "false";
    } else {
      params[key] = value;
    }
  }

  return params;
}

export { buildParams };
