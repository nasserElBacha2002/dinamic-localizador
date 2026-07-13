import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Navigate, Outlet, Route, Routes, useParams } from "react-router-dom";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { CompanyGate } from "../components/company/CompanyGate";
import { FeatureRouteGuard } from "../components/company/FeatureRouteGuard";
import { AppLayout } from "../design-system";
import { LoadingState } from "../design-system";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { PlatformCompaniesPage } from "../pages/platform/PlatformCompaniesPage";
import { CompanyUsersPage } from "../pages/settings/CompanyUsersPage";
import { CompanySettingsPage } from "../pages/settings/CompanySettingsPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { EmployeesListPage } from "../pages/employees/EmployeesListPage";
import { WorkTeamsListPage } from "../pages/work-teams/WorkTeamsListPage";
import { WorkTeamCreatePage } from "../pages/work-teams/WorkTeamCreatePage";
import { WorkTeamEditPage } from "../pages/work-teams/WorkTeamEditPage";
import { EmployeeCreatePage } from "../pages/employees/EmployeeCreatePage";
import { EmployeeEditPage } from "../pages/employees/EmployeeEditPage";
import { ServicesListPage } from "../pages/services/ServicesListPage";
import { ServiceCreatePage } from "../pages/services/ServiceCreatePage";
import { ServiceEditPage } from "../pages/services/ServiceEditPage";
import { OperationsListPage } from "../pages/operations/OperationsListPage";
import { OperationCreatePage } from "../pages/operations/OperationCreatePage";
import { AttendanceListPage } from "../pages/attendance/AttendanceListPage";
import { AttendanceCreatePage } from "../pages/attendance/AttendanceCreatePage";
import { AbsencesListPage } from "../pages/absences/AbsencesListPage";

function lazyNamed<T extends Record<string, ComponentType>>(
  importer: () => Promise<T>,
  exportName: keyof T,
): LazyExoticComponent<ComponentType> {
  return lazy(() => importer().then((module) => ({ default: module[exportName] as ComponentType })));
}

const StatisticsPage = lazyNamed(
  () => import("../pages/statistics/StatisticsPage"),
  "StatisticsPage",
);
const BotSimulatorPage = lazyNamed(
  () => import("../pages/bot-simulator/BotSimulatorPage"),
  "BotSimulatorPage",
);
const OperationImportPage = lazyNamed(
  () => import("../pages/operations/OperationImportPage"),
  "OperationImportPage",
);
const OperationDetailPage = lazyNamed(
  () => import("../pages/operations/OperationDetailPage"),
  "OperationDetailPage",
);
const AbsenceDetailPage = lazyNamed(
  () => import("../pages/absences/AbsenceDetailPage"),
  "AbsenceDetailPage",
);
const AttendanceDetailPage = lazyNamed(
  () => import("../pages/attendance/AttendanceDetailPage"),
  "AttendanceDetailPage",
);

function LazyPage({
  component: Component,
  message,
}: {
  component: LazyExoticComponent<ComponentType>;
  message: string;
}) {
  return (
    <Suspense fallback={<LoadingState message={message} />}>
      <Component />
    </Suspense>
  );
}

function LegacyOperationRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/operations/${id}` : "/operations"} replace />;
}

function LegacyServiceRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/services/${id}` : "/services"} replace />;
}

function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <CompanyGate>
        <AppLayout>
          <Outlet />
        </AppLayout>
      </CompanyGate>
    </ProtectedRoute>
  );
}

const employeeAccess = {
  anyModuleOf: ["attendance", "operations", "absences"] as const,
  requiredAnyPermission: ["employees:read", "employees:manage"] as const,
};

const employeeManage = {
  ...employeeAccess,
  requiredAnyPermission: ["employees:manage"] as const,
};

const workTeamAccess = {
  ...employeeAccess,
};

const workTeamManage = {
  ...employeeManage,
};

const serviceAccess = {
  moduleKey: "operations" as const,
  requiredAnyPermission: ["services:read", "services:manage"] as const,
};

const serviceManage = {
  ...serviceAccess,
  requiredAnyPermission: ["services:manage"] as const,
};

const operationAccess = {
  moduleKey: "operations" as const,
  requiredAnyPermission: ["operations:read", "operations:manage"] as const,
};

const operationManage = {
  ...operationAccess,
  requiredAnyPermission: ["operations:manage"] as const,
};

const attendanceAccess = {
  moduleKey: "attendance" as const,
  requiredAnyPermission: ["attendance:read", "attendance:review", "attendance:export"] as const,
};

const attendanceReview = {
  ...attendanceAccess,
  requiredAnyPermission: ["attendance:review"] as const,
};

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/inventories" element={<Navigate to="/operations" replace />} />
        <Route path="/inventories/new" element={<Navigate to="/operations/new" replace />} />
        <Route path="/inventories/import" element={<Navigate to="/operations/import" replace />} />
        <Route path="/inventories/:id" element={<LegacyOperationRedirect />} />
        <Route path="/stores" element={<Navigate to="/services" replace />} />
        <Route path="/stores/new" element={<Navigate to="/services/new" replace />} />
        <Route path="/stores/:id" element={<LegacyServiceRedirect />} />
        <Route
          path="/employees"
          element={
            <FeatureRouteGuard {...employeeAccess}>
              <EmployeesListPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/employees/new"
          element={
            <FeatureRouteGuard {...employeeManage}>
              <EmployeeCreatePage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/employees/:id"
          element={
            <FeatureRouteGuard {...employeeAccess}>
              <EmployeeEditPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/work-teams"
          element={
            <FeatureRouteGuard {...workTeamAccess}>
              <WorkTeamsListPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/work-teams/new"
          element={
            <FeatureRouteGuard {...workTeamManage}>
              <WorkTeamCreatePage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/work-teams/:id"
          element={
            <FeatureRouteGuard {...workTeamAccess}>
              <WorkTeamEditPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/services"
          element={
            <FeatureRouteGuard {...serviceAccess}>
              <ServicesListPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/services/new"
          element={
            <FeatureRouteGuard {...serviceManage}>
              <ServiceCreatePage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/services/:id"
          element={
            <FeatureRouteGuard {...serviceAccess}>
              <ServiceEditPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/operations"
          element={
            <FeatureRouteGuard {...operationAccess}>
              <OperationsListPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/operations/import"
          element={
            <FeatureRouteGuard {...operationManage}>
              <LazyPage component={OperationImportPage} message="Cargando importación..." />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/operations/new"
          element={
            <FeatureRouteGuard {...operationManage}>
              <OperationCreatePage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/operations/:id"
          element={
            <FeatureRouteGuard {...operationAccess}>
              <LazyPage component={OperationDetailPage} message="Cargando operación..." />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/statistics"
          element={
            <FeatureRouteGuard
              moduleKey="reports"
              requiredAnyPermission={["reports:read", "reports:export"]}
            >
              <LazyPage component={StatisticsPage} message="Cargando estadísticas..." />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/attendance"
          element={
            <FeatureRouteGuard {...attendanceAccess}>
              <AttendanceListPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/attendance/new"
          element={
            <FeatureRouteGuard {...attendanceReview}>
              <AttendanceCreatePage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/attendance/:id"
          element={
            <FeatureRouteGuard {...attendanceAccess}>
              <LazyPage component={AttendanceDetailPage} message="Cargando asistencia..." />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/absences"
          element={
            <FeatureRouteGuard
              moduleKey="absences"
              requiredAnyPermission={["absences:read", "absences:review"]}
            >
              <AbsencesListPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/absences/:id"
          element={
            <FeatureRouteGuard
              moduleKey="absences"
              requiredAnyPermission={["absences:read", "absences:review"]}
            >
              <LazyPage component={AbsenceDetailPage} message="Cargando ausencia..." />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/bot-simulator"
          element={
            <FeatureRouteGuard
              moduleKey="bot_simulator"
              requiredAnyPermission={["bot_simulator:use"]}
            >
              <LazyPage component={BotSimulatorPage} message="Cargando simulador..." />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/settings/users"
          element={
            <FeatureRouteGuard requiredAnyPermission={["users:manage"]}>
              <CompanyUsersPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/settings/company"
          element={
            <FeatureRouteGuard requiredAnyPermission={["company:settings:update"]}>
              <CompanySettingsPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/platform/companies"
          element={
            <FeatureRouteGuard requirePlatformAdmin>
              <PlatformCompaniesPage />
            </FeatureRouteGuard>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
