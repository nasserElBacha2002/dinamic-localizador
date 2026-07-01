import { CssBaseline, ThemeProvider } from "@mui/material";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { CompanyProviderGate } from "./context/CompanyContext";
import { queryClient } from "./lib/query-client";
import { appTheme } from "./theme/theme";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider theme={appTheme}>
      <CssBaseline />
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <CompanyProviderGate>
              <App />
            </CompanyProviderGate>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
