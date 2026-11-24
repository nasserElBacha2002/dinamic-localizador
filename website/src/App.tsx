import { CleaningCompaniesLandingPage } from "./pages/CleaningCompaniesLandingPage";
import { LandingPage } from "./pages/LandingPage";
import { resolveMarketingRoute } from "./marketing-path";

export function App() {
  const route = resolveMarketingRoute(window.location.pathname);
  if (route === "cleaning") {
    return <CleaningCompaniesLandingPage />;
  }
  return <LandingPage />;
}
