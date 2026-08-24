import { Button, Group, Stack, Tabs } from "@mantine/core";
import { lazy, Suspense, useMemo } from "react";
import { useSearchParams } from "react-router";
import { useParams } from "react-router";
import { EntityEditAction } from "../../components/navigation/EntityEditAction";
import {
  EntityPageTitle,
  ErrorState,
  LoadingState,
  PageHeader,
} from "../../design-system";
import { useCompanyModules } from "../../hooks/useCompanyModules";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useEmployee } from "../../hooks/useEmployees";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { terminology } from "../../domain/terminology";
import { canAccessModuleRoute, type ModuleRouteAccessKey } from "../../utils/company-modules";
import { getApiErrorMessage } from "../../utils/errors";
import { hasPermission } from "../../utils/permissions";
import {
  EMPLOYEE_DETAIL_TABS,
  parseEmployeeDetailTab,
  type EmployeeDetailTabKey,
} from "./employee-detail-tabs";
import { EmployeeSummaryTab } from "./tabs/EmployeeSummaryTab";

const EmployeeOperationsTab = lazy(() =>
  import("./tabs/EmployeeOperationsTab").then((module) => ({
    default: module.EmployeeOperationsTab,
  })),
);
const EmployeeAttendanceTab = lazy(() =>
  import("./tabs/EmployeeAttendanceTab").then((module) => ({
    default: module.EmployeeAttendanceTab,
  })),
);
const EmployeeAbsencesTab = lazy(() =>
  import("./tabs/EmployeeAbsencesTab").then((module) => ({
    default: module.EmployeeAbsencesTab,
  })),
);
const EmployeePayrollTab = lazy(() =>
  import("./tabs/EmployeePayrollTab").then((module) => ({
    default: module.EmployeePayrollTab,
  })),
);
const EmployeeStatisticsTab = lazy(() =>
  import("./tabs/EmployeeStatisticsTab").then((module) => ({
    default: module.EmployeeStatisticsTab,
  })),
);

const TAB_MODULE_ACCESS: Partial<Record<EmployeeDetailTabKey, ModuleRouteAccessKey>> = {
  asistencias: "attendance",
  ausencias: "absences",
  recibos: "payroll_receipts",
  estadisticas: "reports",
};

function canAccessEmployeeDetailTab(
  tab: EmployeeDetailTabKey,
  modules: ReturnType<typeof useCompanyModules>["data"],
  permissions: string[] | undefined,
): boolean {
  if (tab === "resumen") {
    return true;
  }

  if (tab === "operaciones") {
    return (
      hasPermission(permissions, "operations:read") ||
      hasPermission(permissions, "operations:manage")
    );
  }

  const accessKey = TAB_MODULE_ACCESS[tab];
  if (!accessKey) {
    return true;
  }

  return canAccessModuleRoute(modules, permissions, accessKey);
}

export function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { goBackToList } = useListBackNavigation("/employees");
  const permissionsQuery = useCompanyPermissions();
  const modulesQuery = useCompanyModules();
  const canManage = hasPermission(permissionsQuery.data?.permissions, "employees:manage");
  const canUpdateBalance = hasPermission(
    permissionsQuery.data?.permissions,
    "absences:balance:update",
  );
  const employeeQuery = useEmployee(id);

  const permissions = permissionsQuery.data?.permissions;
  const modules = modulesQuery.data;

  const availableTabs = useMemo(
    () =>
      EMPLOYEE_DETAIL_TABS.filter((tab) =>
        canAccessEmployeeDetailTab(tab.value, modules, permissions),
      ),
    [modules, permissions],
  );

  const requestedTab = parseEmployeeDetailTab(searchParams.get("tab"));
  const activeTab = availableTabs.some((tab) => tab.value === requestedTab)
    ? requestedTab
    : "resumen";

  const setActiveTab = (value: string | null) => {
    const nextTab = parseEmployeeDetailTab(value);
    if (nextTab === "resumen") {
      setSearchParams({}, { replace: true });
      return;
    }
    setSearchParams({ tab: nextTab }, { replace: true });
  };

  if (!id) {
    return <ErrorState message={`${terminology.worker.singular} no encontrado.`} />;
  }

  if (employeeQuery.isLoading || permissionsQuery.isPending) {
    return <LoadingState />;
  }

  if (employeeQuery.isError || !employeeQuery.data) {
    return (
      <ErrorState
        message={getApiErrorMessage(
          employeeQuery.error,
          `${terminology.worker.singular} no encontrado.`,
        )}
      />
    );
  }

  const employee = employeeQuery.data;

  return (
    <Stack gap="md">
      <PageHeader
        title={<EntityPageTitle name={employee.name} entityType="collaborator" />}
        description={`Detalle de ${terminology.worker.singular.toLowerCase()}`}
        action={
          <Group gap="sm">
            {canManage ? <EntityEditAction entity="employees" id={employee.id} /> : null}
            <Button variant="default" onClick={goBackToList}>
              Volver al listado
            </Button>
          </Group>
        }
      />

      <Tabs value={activeTab} onChange={setActiveTab}>
        <Tabs.List style={{ flexWrap: "nowrap", overflowX: "auto" }}>
          {availableTabs.map((tab) => (
            <Tabs.Tab key={tab.value} value={tab.value}>
              {tab.label}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>

      {activeTab === "resumen" ? (
        <EmployeeSummaryTab employee={employee} canManage={canManage} enabled />
      ) : null}

      {activeTab === "operaciones" ? (
        <Suspense fallback={<LoadingState />}>
          <EmployeeOperationsTab employeeId={employee.id} enabled />
        </Suspense>
      ) : null}

      {activeTab === "asistencias" ? (
        <Suspense fallback={<LoadingState />}>
          <EmployeeAttendanceTab employeeId={employee.id} />
        </Suspense>
      ) : null}

      {activeTab === "ausencias" ? (
        <Suspense fallback={<LoadingState />}>
          <EmployeeAbsencesTab employeeId={employee.id} canUpdateBalance={canUpdateBalance} />
        </Suspense>
      ) : null}

      {activeTab === "recibos" ? (
        <Suspense fallback={<LoadingState />}>
          <EmployeePayrollTab employeeId={employee.id} />
        </Suspense>
      ) : null}

      {activeTab === "estadisticas" ? (
        <Suspense fallback={<LoadingState />}>
          <EmployeeStatisticsTab employeeId={employee.id} enabled />
        </Suspense>
      ) : null}
    </Stack>
  );
}
