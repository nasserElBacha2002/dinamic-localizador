import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from "react";
import { Outlet, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { CompanyGate } from "../components/company/CompanyGate";
import { LoadingState } from "../components/common/LoadingState";
import { HomePage } from "../pages/HomePage";
import { LoginPage } from "../pages/LoginPage";
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
        <Outlet />
      </CompanyGate>
    </ProtectedRoute>
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/employees" element={<EmployeesListPage />} />
        <Route path="/employees/new" element={<EmployeeCreatePage />} />
        <Route path="/employees/:id" element={<EmployeeEditPage />} />
        <Route path="/stores" element={<StoresListPage />} />
        <Route path="/stores/new" element={<StoreCreatePage />} />
        <Route path="/stores/:id" element={<StoreEditPage />} />
        <Route path="/inventories" element={<InventoriesListPage />} />
        <Route
          path="/inventories/import"
          element={<LazyPage component={InventoryImportPage} message="Cargando importación..." />}
        />
        <Route path="/inventories/new" element={<InventoryCreatePage />} />
        <Route
          path="/inventories/:id"
          element={<LazyPage component={InventoryDetailPage} message="Cargando inventario..." />}
        />
        <Route
          path="/statistics"
          element={<LazyPage component={StatisticsPage} message="Cargando estadísticas..." />}
        />
        <Route path="/attendance" element={<AttendanceListPage />} />
        <Route path="/attendance/new" element={<AttendanceCreatePage />} />
        <Route
          path="/attendance/:id"
          element={<LazyPage component={AttendanceDetailPage} message="Cargando asistencia..." />}
        />
        <Route path="/absences" element={<AbsencesListPage />} />
        <Route
          path="/absences/:id"
          element={<LazyPage component={AbsenceDetailPage} message="Cargando ausencia..." />}
        />
        <Route
          path="/bot-simulator"
          element={<LazyPage component={BotSimulatorPage} message="Cargando simulador..." />}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
