import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Outlet, Route, Routes } from "react-router-dom";
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
import { EmployeeCreatePage } from "../pages/employees/EmployeeCreatePage";
import { EmployeeEditPage } from "../pages/employees/EmployeeEditPage";
import { StoresListPage } from "../pages/stores/StoresListPage";
import { StoreCreatePage } from "../pages/stores/StoreCreatePage";
import { StoreEditPage } from "../pages/stores/StoreEditPage";
import { InventoriesListPage } from "../pages/inventories/InventoriesListPage";
import { InventoryCreatePage } from "../pages/inventories/InventoryCreatePage";
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
const InventoryImportPage = lazyNamed(
  () => import("../pages/inventories/InventoryImportPage"),
  "InventoryImportPage",
);
const InventoryDetailPage = lazyNamed(
  () => import("../pages/inventories/InventoryDetailPage"),
  "InventoryDetailPage",
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
  anyModuleOf: ["attendance", "inventory_operations", "absences"] as const,
  requiredAnyPermission: ["employees:read", "employees:manage"] as const,
};

const employeeManage = {
  ...employeeAccess,
  requiredAnyPermission: ["employees:manage"] as const,
};

const storeAccess = {
  moduleKey: "inventory_operations" as const,
  requiredAnyPermission: ["stores:read", "stores:manage"] as const,
};

const storeManage = {
  ...storeAccess,
  requiredAnyPermission: ["stores:manage"] as const,
};

const inventoryAccess = {
  moduleKey: "inventory_operations" as const,
  requiredAnyPermission: ["inventories:read", "inventories:manage"] as const,
};

const inventoryManage = {
  ...inventoryAccess,
  requiredAnyPermission: ["inventories:manage"] as const,
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
          path="/stores"
          element={
            <FeatureRouteGuard {...storeAccess}>
              <StoresListPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/stores/new"
          element={
            <FeatureRouteGuard {...storeManage}>
              <StoreCreatePage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/stores/:id"
          element={
            <FeatureRouteGuard {...storeAccess}>
              <StoreEditPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/inventories"
          element={
            <FeatureRouteGuard {...inventoryAccess}>
              <InventoriesListPage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/inventories/import"
          element={
            <FeatureRouteGuard {...inventoryManage}>
              <LazyPage component={InventoryImportPage} message="Cargando importación..." />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/inventories/new"
          element={
            <FeatureRouteGuard {...inventoryManage}>
              <InventoryCreatePage />
            </FeatureRouteGuard>
          }
        />
        <Route
          path="/inventories/:id"
          element={
            <FeatureRouteGuard {...inventoryAccess}>
              <LazyPage component={InventoryDetailPage} message="Cargando inventario..." />
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
