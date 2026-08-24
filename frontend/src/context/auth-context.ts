import { createContext } from "react";
import type { LoginResult, PublicUser } from "../api/auth.api";

export interface AuthContextValue {
  user: PublicUser | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  completeTwoFactorLogin: (token: string, user: PublicUser) => void;
  logout: () => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
