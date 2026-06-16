import { Outlet, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "../components/auth/ProtectedRoute";
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
import { LoginPage } from "../pages/LoginPage";
import { NotFoundPage } from "../pages/NotFoundPage";
import { StoreCreatePage } from "../pages/stores/StoreCreatePage";
import { StoreEditPage } from "../pages/stores/StoreEditPage";
import { StoresListPage } from "../pages/stores/StoresListPage";

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
        <Route path="/inventories/new" element={<InventoryCreatePage />} />
        <Route path="/inventories/:id" element={<InventoryDetailPage />} />
        <Route path="/attendance" element={<AttendanceListPage />} />
        <Route path="/attendance/new" element={<AttendanceCreatePage />} />
        <Route path="/attendance/:id" element={<AttendanceDetailPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
