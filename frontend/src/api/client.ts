import axios from "axios";
import { getStoredToken } from "./auth.api";
import { parseApiError } from "../utils/errors";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

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

  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.status === 401) {
      unauthorizedHandler?.();
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
