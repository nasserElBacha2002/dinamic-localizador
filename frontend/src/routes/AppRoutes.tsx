import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Navigate, Outlet, Route, Routes } from "react-router";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { CompanyGate } from "../components/company/CompanyGate";
import { FeatureRouteGuard } from "../components/company/FeatureRouteGuard";
import { AppLayout } from "../design-system";
import { LoadingState } from "../design-system";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
import { AcceptInvitationPage } from "../pages/invitations/AcceptInvitationPage";
import { PlatformCompaniesPage } from "../pages/platform/PlatformCompaniesPage";
import { CompanyUsersPage } from "../pages/settings/CompanyUsersPage";
import { CompanySettingsPage } from "../pages/settings/CompanySettingsPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { EmployeesListPage } from "../pages/employees/EmployeesListPage";
import { WorkTeamsListPage } from "../pages/work-teams/WorkTeamsListPage";
import { WorkTeamCreatePage } from "../pages/work-teams/WorkTeamCreatePage";
import { WorkTeamEditPage } from "../pages/work-teams/WorkTeamEditPage";
import { WorkTeamDetailPage } from "../pages/work-teams/WorkTeamDetailPage";
import { EmployeeCreatePage } from "../pages/employees/EmployeeCreatePage";
import { EmployeeEditPage } from "../pages/employees/EmployeeEditPage";
import { EmployeeDetailPage } from "../pages/employees/EmployeeDetailPage";
import { ServicesListPage } from "../pages/services/ServicesListPage";
import { ServiceCreatePage } from "../pages/services/ServiceCreatePage";
import { ServiceEditPage } from "../pages/services/ServiceEditPage";
import { ServiceDetailPage } from "../pages/services/ServiceDetailPage";
import { OperationsListPage } from "../pages/operations/OperationsListPage";
import { OperationCreatePage } from "../pages/operations/OperationCreatePage";
import { AttendanceListPage } from "../pages/attendance/AttendanceListPage";
import { AttendanceCreatePage } from "../pages/attendance/AttendanceCreatePage";
import { AbsencesListPage } from "../pages/absences/AbsencesListPage";
import { MODULE_ROUTE_ACCESS } from "../utils/company-modules";
import {
  employeeAccess,
  employeeManage,
  operationAccess,
  operationManage,
  serviceAccess,
  serviceManage,
  workTeamAccess,
  workTeamManage,
} from "./entity-route-access";
import { LegacyOperationRedirect, LegacyServiceRedirect } from "./legacy-redirects";

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
const ImportPage = lazyNamed(
  () => import("../pages/imports/ImportPage"),
  "ImportPage",
);
const OperationDetailPage = lazyNamed(
  () => import("../pages/operations/OperationDetailPage"),
  "OperationDetailPage",
);
const OperationEditPage = lazyNamed(
  () => import("../pages/operations/OperationEditPage"),
  "OperationEditPage",
);
const AbsenceDetailPage = lazyNamed(
  () => import("../pages/absences/AbsenceDetailPage"),
  "AbsenceDetailPage",
);
const AttendanceDetailPage = lazyNamed(
  () => import("../pages/attendance/AttendanceDetailPage"),
  "AttendanceDetailPage",
);
const WhatsappObservabilityPage = lazyNamed(
  () => import("../pages/platform/observability/WhatsappObservabilityPage"),
  "WhatsappObservabilityPage",
);
const WhatsappObservabilityErrorsPage = lazyNamed(
  () => import("../pages/platform/observability/WhatsappObservabilityErrorsPage"),
  "WhatsappObservabilityErrorsPage",
);
const WhatsappConversationDetailPage = lazyNamed(
  () => import("../pages/platform/observability/WhatsappConversationDetailPage"),
  "WhatsappConversationDetailPage",
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

const attendanceAccess = MODULE_ROUTE_ACCESS.attendance;

const attendanceReview = {
  ...attendanceAccess,
  requiredAnyPermission: ["attendance:review"] as const,
};

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invitations/accept" element={<AcceptInvitationPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/inventories" element={<Navigate to="/operations" replace />} />
        <Route path="/inventories/new" element={<Navigate to="/operations/new" replace />} />
        <Route path="/inventories/import" element={<Navigate to="/imports?entity=operations" replace />} />
        <Route path="/operations/import" element={<Navigate to="/imports?entity=operations" replace />} />
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
          path="/employees/:id/edit"
          element={
            <FeatureRouteGuard {...employeeManage}>
              <EmployeeEditPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/employees/:id"
          element={
            <FeatureRouteGuard {...employeeAccess}>
              <EmployeeDetailPage />
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
          path="/work-teams/:id/edit"
          element={
            <FeatureRouteGuard {...workTeamManage}>
              <WorkTeamEditPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/work-teams/:id"
          element={
            <FeatureRouteGuard {...workTeamAccess}>
              <WorkTeamDetailPage />
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
          path="/services/:id/edit"
          element={
            <FeatureRouteGuard {...serviceManage}>
              <ServiceEditPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/services/:id"
          element={
            <FeatureRouteGuard {...serviceAccess}>
              <ServiceDetailPage />
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
          path="/imports"
          element={
            <FeatureRouteGuard
              anyModuleOf={["operations", "attendance", "absences"]}
              requiredAnyPermission={["operations:manage", "services:manage", "employees:manage"]}
            >
              <LazyPage component={ImportPage} message="Cargando importación..." />
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
          path="/operations/:id/edit"
          element={
            <FeatureRouteGuard {...operationManage}>
              <LazyPage component={OperationEditPage} message="Cargando edición..." />
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
            <FeatureRouteGuard {...MODULE_ROUTE_ACCESS.reports}>
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
            <FeatureRouteGuard {...MODULE_ROUTE_ACCESS.absences}>
              <AbsencesListPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/absences/:id"
          element={
            <FeatureRouteGuard {...MODULE_ROUTE_ACCESS.absences}>
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
        <Route
          path="/platform/observability/whatsapp"
          element={
            <FeatureRouteGuard requirePlatformAdmin>
              <LazyPage component={WhatsappObservabilityPage} message="Cargando observabilidad..." />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/platform/observability/whatsapp/errors"
          element={
            <FeatureRouteGuard requirePlatformAdmin>
              <LazyPage
                component={WhatsappObservabilityErrorsPage}
                message="Cargando errores..."
              />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/platform/observability/whatsapp/:conversationId"
          element={
            <FeatureRouteGuard requirePlatformAdmin>
              <LazyPage
                component={WhatsappConversationDetailPage}
                message="Cargando conversación..."
              />
            </FeatureRouteGuard>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
