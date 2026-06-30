import { apiClient } from "./client";

export {
  clearStoredToken,
  getStoredToken,
  setStoredToken,
} from "./token-storage";

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
