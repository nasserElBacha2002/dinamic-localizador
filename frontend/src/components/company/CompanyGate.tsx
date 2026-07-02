import { Navigate } from "react-router-dom";
import { CompanySelectionPage } from "./CompanySelector";
import { ErrorState, LoadingState } from "../../design-system";
import { useCompany } from "../../hooks/useCompany";

export function CompanyGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isReady, requiresSelection, hasNoCompanies } = useCompany();

  if (isLoading) {
    return <LoadingState message="Cargando empresas..." />;
  }

  if (hasNoCompanies) {
    return (
      <ErrorState message="No tenés acceso a ninguna empresa activa. Contactá al administrador de la plataforma." />
    );
  }

  if (requiresSelection) {
    return <CompanySelectionPage />;
  }

  if (!isReady) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
