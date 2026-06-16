import { useCallback, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  clearStoredToken,
  getCurrentUser,
  getStoredToken,
  login as loginRequest,
  setStoredToken,
  type PublicUser,
} from "../api/auth.api";
import { setUnauthorizedHandler } from "../api/client";
import { AuthContext, type AuthContextValue } from "./auth-context";

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      logout();
    });
  }, [logout]);

  useEffect(() => {
    const restoreSession = async () => {
      const storedToken = getStoredToken();
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      setToken(storedToken);

      try {
        const currentUser = await getCurrentUser();
        setUser(currentUser);
      } catch {
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    void restoreSession();
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await loginRequest(email, password);
    setStoredToken(result.token);
    setToken(result.token);
    setUser(result.user);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      isLoading,
      isAuthenticated: Boolean(token && user),
      login,
      logout,
    }),
    [user, token, isLoading, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
