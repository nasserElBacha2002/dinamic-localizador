import { lazy, Suspense } from "react";
import { Outlet, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
import { LoadingState } from "../components/common/LoadingState";
import { AttendanceCreatePage } from "../pages/attendance/AttendanceCreatePage";
import { AttendanceDetailPage } from "../pages/attendance/AttendanceDetailPage";
import { AttendanceListPage } from "../pages/attendance/AttendanceListPage";
import { EmployeeCreatePage } from "../pages/employees/EmployeeCreatePage";
import { EmployeeEditPage } from "../pages/employees/EmployeeEditPage";
import { EmployeesListPage } from "../pages/employees/EmployeesListPage";
import { HomePage } from "../pages/HomePage";
import { InventoriesListPage } from "../pages/inventories/InventoriesListPage";
import { InventoryCreatePage } from "../pages/inventories/InventoryCreatePage";
import { InventoryDetailPage } from "../pages/inventories/InventoryDetailPage";
import { InventoryImportPage } from "../pages/inventories/InventoryImportPage";
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { StoreCreatePage } from "../pages/stores/StoreCreatePage";
import { StoreEditPage } from "../pages/stores/StoreEditPage";
import { StoresListPage } from "../pages/stores/StoresListPage";
import { AbsencesListPage } from "../pages/absences/AbsencesListPage";
import { AbsenceDetailPage } from "../pages/absences/AbsenceDetailPage";
import { BotSimulatorPage } from "../pages/bot-simulator/BotSimulatorPage";

const StatisticsPage = lazy(() =>
  import("../pages/statistics/StatisticsPage").then((module) => ({
    default: module.StatisticsPage,
  })),
);

function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <Outlet />
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
        <Route path="/inventories/import" element={<InventoryImportPage />} />
        <Route path="/inventories/new" element={<InventoryCreatePage />} />
        <Route path="/inventories/:id" element={<InventoryDetailPage />} />
        <Route
          path="/statistics"
          element={
            <Suspense fallback={<LoadingState message="Cargando estadísticas..." />}>
              <StatisticsPage />
            </Suspense>
          }
        />
        <Route path="/attendance" element={<AttendanceListPage />} />
        <Route path="/attendance/new" element={<AttendanceCreatePage />} />
        <Route path="/attendance/:id" element={<AttendanceDetailPage />} />
        <Route path="/absences" element={<AbsencesListPage />} />
        <Route path="/absences/:id" element={<AbsenceDetailPage />} />
        <Route path="/bot-simulator" element={<BotSimulatorPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
