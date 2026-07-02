import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { CssBaseline, ThemeProvider as MuiThemeProvider } from "@mui/material";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AuthProvider } from "./context/AuthContext";
import { CompanyProviderGate } from "./context/CompanyContext";
import { mantineTheme } from "./design-system";
import { queryClient } from "./lib/query-client";
import { appTheme } from "./theme/theme";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <MantineProvider theme={mantineTheme}>
        <Notifications position="top-right" />
        <MuiThemeProvider theme={appTheme}>
          <CssBaseline />
          <BrowserRouter>
            <AuthProvider>
              <CompanyProviderGate>
                <App />
              </CompanyProviderGate>
            </AuthProvider>
          </BrowserRouter>
        </MuiThemeProvider>
      </MantineProvider>
    </QueryClientProvider>
  </StrictMode>,
);
