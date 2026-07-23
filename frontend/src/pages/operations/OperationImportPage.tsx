import { Navigate } from "react-router-dom";

/** @deprecated Use `/imports?entity=operations`. Kept for deep-link compatibility. */
export function OperationImportPage() {
  return <Navigate to="/imports?entity=operations" replace />;
}
