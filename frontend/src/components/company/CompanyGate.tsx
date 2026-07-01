import { Navigate } from "react-router-dom";
import { CompanySelectionPage } from "./CompanySelector";
import { LoadingState } from "../common/LoadingState";
import { useCompany } from "../../hooks/useCompany";

export function CompanyGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isReady, requiresSelection } = useCompany();

  if (isLoading) {
    return <LoadingState message="Cargando empresas..." />;
  }

  if (requiresSelection) {
    return <CompanySelectionPage />;
  }

  if (!isReady) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
