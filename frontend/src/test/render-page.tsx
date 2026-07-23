import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { useEffect, type ReactElement, type ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthContext, type AuthContextValue } from "../context/auth-context";
import { CompanyContext, type CompanyContextValue } from "../context/company-context";
import { setRuntimeCompanyId } from "../api/company-path";
import { mantineTheme } from "../design-system";
import { installLayoutPolyfills } from "./layout-polyfills";

export { installLayoutPolyfills };

const defaultAuth: AuthContextValue = {
  user: {
    id: "user-1",
    email: "ops@example.com",
    name: "Operador Test",
    role: "ADMIN",
    isPlatformAdmin: false,
  },
  token: "test-token",
  isLoading: false,
  isAuthenticated: true,
  login: async () => undefined,
  logout: () => undefined,
};

const defaultCompany: CompanyContextValue = {
  companies: [
    {
      companyId: "co-1",
      companyName: "Empresa Test",
      role: "ADMIN",
      isDefault: true,
      status: "ACTIVE",
    },
  ],
  activeCompany: {
    companyId: "co-1",
    companyName: "Empresa Test",
    role: "ADMIN",
    isDefault: true,
    status: "ACTIVE",
  },
  isLoading: false,
  isReady: true,
  requiresSelection: false,
  hasNoCompanies: false,
  selectCompany: () => undefined,
  refreshCompanies: async () => undefined,
  clearActiveCompany: () => undefined,
};

/** QueryClients created by renderPage — cleared on test cleanup so long gcTime timers do not hang Node. */
const activeTestQueryClients = new Set<QueryClient>();

export function clearActiveTestQueryClients(): void {
  for (const client of activeTestQueryClients) {
    client.clear();
  }
  activeTestQueryClients.clear();
}

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export type RenderPageOptions = {
  route?: string;
  auth?: Partial<AuthContextValue>;
  company?: Partial<CompanyContextValue>;
  queryClient?: QueryClient;
} & Omit<RenderOptions, "wrapper">;

export function renderPage(
  ui: ReactElement,
  {
    route = "/",
    auth,
    company,
    queryClient = createTestQueryClient(),
    ...renderOptions
  }: RenderPageOptions = {},
): RenderResult & { queryClient: QueryClient } {
  const authValue = { ...defaultAuth, ...auth };
  const companyValue = { ...defaultCompany, ...company };
  setRuntimeCompanyId(companyValue.activeCompany?.companyId ?? "co-1");
  activeTestQueryClients.add(queryClient);

  function Wrapper({ children }: { children: ReactNode }) {
    useEffect(() => {
      return () => {
        queryClient.clear();
        activeTestQueryClients.delete(queryClient);
      };
    }, []);

    return (
      <QueryClientProvider client={queryClient}>
        <AuthContext.Provider value={authValue}>
          <CompanyContext.Provider value={companyValue}>
            <MantineProvider theme={mantineTheme}>
              <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
            </MantineProvider>
          </CompanyContext.Provider>
        </AuthContext.Provider>
      </QueryClientProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), queryClient };
}
