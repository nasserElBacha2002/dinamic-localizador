import { Navigate, useParams } from "react-router";

export function LegacyOperationRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/operations/${id}` : "/operations"} replace />;
}

export function LegacyServiceRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/services/${id}` : "/services"} replace />;
}
