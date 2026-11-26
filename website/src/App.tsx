import { CleaningCompaniesLandingPage } from "./pages/CleaningCompaniesLandingPage";
import { LandingPage } from "./pages/LandingPage";
import { PrivacyPolicyPage } from "./pages/PrivacyPolicyPage";
import { resolveMarketingRoute } from "./marketing-path";

export function App() {
  const route = resolveMarketingRoute(window.location.pathname);
  if (route === "cleaning") {
    return <CleaningCompaniesLandingPage />;
  }
  if (route === "privacy") {
    return <PrivacyPolicyPage />;
  }
  return <LandingPage />;
}
