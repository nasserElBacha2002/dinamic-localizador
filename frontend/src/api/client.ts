import axios from "axios";
import {
  getActiveCompanyId,
  isLegacyOperationalApiPath,
  notifyCompanySelectionRequired,
} from "./company-path";
import { getStoredToken } from "./token-storage";
import { parseApiError } from "../utils/errors";

const viteEnv = (import.meta as { env?: ImportMetaEnv }).env;
const baseURL = viteEnv?.VITE_API_URL ?? globalThis.__VITE_API_URL__;

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

/** Step-up / login 401s must not wipe a still-valid JWT session. */
const AUTH_CHALLENGE_401_CODES = new Set([
  "INVALID_CREDENTIALS",
  "INVALID_TWO_FACTOR_CODE",
  "INVALID_TWO_FACTOR_CHALLENGE",
]);

export function shouldClearSessionOn401(status: number | undefined, code: string | undefined): boolean {
  if (status !== 401) {
    return false;
  }
  if (code && AUTH_CHALLENGE_401_CODES.has(code)) {
    return false;
  }
  return true;
}

apiClient.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (viteEnv?.DEV) {
    const requestUrl = config.url ?? "";
    if (isLegacyOperationalApiPath(requestUrl)) {
      console.warn(
        `Legacy operational API route detected. Use scopedApiClient instead: ${requestUrl}`,
      );
    }
  }

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      if (shouldClearSessionOn401(error.response?.status, error.response?.data?.error?.code)) {
        unauthorizedHandler?.();
      }

      const code = error.response?.data?.error?.code;
      const requestUrl = error.config?.url;

      if (error.response?.status === 409 && code === "COMPANY_SELECTION_REQUIRED") {
        const hasActiveCompany = Boolean(getActiveCompanyId());
        const isLegacyRoute = isLegacyOperationalApiPath(requestUrl);

        if (viteEnv?.DEV && hasActiveCompany && isLegacyRoute) {
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
  filters: Record<string, string | number | boolean | string[] | undefined>,
): Record<string, string | number> {
  const params: Record<string, string | number> = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") {
      continue;
    }

    if (Array.isArray(value)) {
      const joined = value.map(String).map((item) => item.trim()).filter(Boolean);
      const unique = [...new Set(joined)];
      if (unique.length === 0) {
        continue;
      }
      params[key] = unique.join(",");
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
