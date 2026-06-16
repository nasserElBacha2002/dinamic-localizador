import { apiClient } from "./client";

const TOKEN_KEY = "dinamic_auth_token";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN";
}

export interface LoginResponse {
  token: string;
  user: PublicUser;
}

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const response = await apiClient.post<{ data: LoginResponse }>("/auth/login", {
    email,
    password,
  });
  return response.data.data;
}

export async function getCurrentUser(): Promise<PublicUser> {
  const response = await apiClient.get<{ data: PublicUser }>("/auth/me");
  return response.data.data;
}
