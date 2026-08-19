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
  isPlatformAdmin: boolean;
}

export type LoginResult =
  | {
      requiresTwoFactor: false;
      token: string;
      user: PublicUser;
    }
  | {
      requiresTwoFactor: true;
      challengeToken: string;
    };

export interface TwoFactorSetupResponse {
  otpauthUri: string;
  secret: string;
}

export interface TwoFactorStatus {
  enabled: boolean;
  remainingRecoveryCodes: number;
}

export async function login(email: string, password: string): Promise<LoginResult> {
  const response = await apiClient.post<{ data: LoginResult }>("auth/login", {
    email,
    password,
  });
  return response.data.data;
}

export async function loginWithTwoFactor(input: {
  challengeToken: string;
  code?: string;
  recoveryCode?: string;
}): Promise<Extract<LoginResult, { requiresTwoFactor: false }>> {
  const response = await apiClient.post<{
    data: Extract<LoginResult, { requiresTwoFactor: false }>;
  }>("auth/login/2fa", input);
  return response.data.data;
}

export async function getCurrentUser(): Promise<PublicUser> {
  const response = await apiClient.get<{ data: PublicUser }>("auth/me");
  return response.data.data;
}

export async function requestPasswordReset(email: string): Promise<{ message: string }> {
  const response = await apiClient.post<{ data: { message: string } }>("auth/forgot-password", {
    email,
  });
  return response.data.data;
}

export async function resetPassword(input: {
  token: string;
  password: string;
  passwordConfirmation: string;
}): Promise<{ message: string }> {
  const response = await apiClient.post<{ data: { message: string } }>("auth/reset-password", input);
  return response.data.data;
}

export async function getTwoFactorStatus(): Promise<TwoFactorStatus> {
  const response = await apiClient.get<{ data: TwoFactorStatus }>("auth/2fa/status");
  return response.data.data;
}

export async function setupTwoFactor(): Promise<TwoFactorSetupResponse> {
  const response = await apiClient.post<{ data: TwoFactorSetupResponse }>("auth/2fa/setup");
  return response.data.data;
}

export async function confirmTwoFactor(input: {
  password: string;
  code: string;
}): Promise<{ recoveryCodes: string[] }> {
  const response = await apiClient.post<{ data: { recoveryCodes: string[] } }>("auth/2fa/confirm", input);
  return response.data.data;
}

export async function disableTwoFactor(input: {
  password: string;
  code?: string;
  recoveryCode?: string;
}): Promise<{ message: string }> {
  const response = await apiClient.post<{ data: { message: string } }>("auth/2fa/disable", input);
  return response.data.data;
}

export async function regenerateRecoveryCodes(input: {
  password: string;
  code: string;
}): Promise<{ recoveryCodes: string[] }> {
  const response = await apiClient.post<{ data: { recoveryCodes: string[] } }>(
    "auth/2fa/recovery-codes/regenerate",
    input,
  );
  return response.data.data;
}
