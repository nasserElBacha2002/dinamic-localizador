import axios from "axios";

const baseURL = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

export const httpClient = axios.create({
  baseURL,
  timeout: 10000,
});

httpClient.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const message = error.response?.data?.error?.message ?? error.message;
      return Promise.reject(new Error(message));
    }

    return Promise.reject(new Error("Error inesperado al llamar a la API"));
  },
);
