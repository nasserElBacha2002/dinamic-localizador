import { SimpleGrid, Stack, Text } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getEmployeeOperationalAvailability } from "../../../api/employees.api";
import { EmployeeOperationalAvailabilityCard } from "../../../components/employees/EmployeeOperationalAvailabilityCard";
import { DetailFieldGrid, SectionCard, StatusBadge } from "../../../design-system";
import { useEmployeeOperations } from "../../../hooks/useEmployeeOperations";
import { useOperationalQueryEnabled } from "../../../hooks/useOperationalQueryEnabled";
import { useStatisticsSummary } from "../../../hooks/useStatistics";
import type { Employee } from "../../../types/employee";
import { terminology } from "../../../domain/terminology";
import {
  getDefaultStatisticsDateRange,
  getDateRangeQueryValue,
} from "../../../utils/date-range";
import { dateInputToIsoEnd, dateInputToIsoStart, formatDateTime } from "../../../utils/dates";
import { safeText } from "../../../utils/display-safe";
import { activeStatusLabel, employeeTypeLabels } from "../../../utils/labels";

interface EmployeeSummaryTabProps {
  employee: Employee;
  canManage: boolean;
  enabled: boolean;
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <Stack gap={2}>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text size="sm" fw={500}>
        {value}
      </Text>
    </Stack>
  );
}

export function EmployeeSummaryTab({ employee, canManage, enabled }: EmployeeSummaryTabProps) {
  const monthRange = useMemo(() => getDefaultStatisticsDateRange(), []);
  const monthQuery = getDateRangeQueryValue(monthRange);

  const activeOpsQuery = useEmployeeOperations(
    employee.id,
    { segment: "active", page: 1, limit: 1 },
    enabled,
  );
  const activeOpsCountQuery = useEmployeeOperations(
    employee.id,
    { segment: "active", page: 1, limit: 1 },
    enabled,
  );
  const pastOpsQuery = useEmployeeOperations(
    employee.id,
    { segment: "past", page: 1, limit: 1 },
    enabled,
  );
  const monthOpsActiveQuery = useEmployeeOperations(
    employee.id,
    {
      segment: "active",
      page: 1,
      limit: 1,
      dateFrom: monthQuery.from ? dateInputToIsoStart(monthQuery.from) : undefined,
      dateTo: monthQuery.to ? dateInputToIsoEnd(monthQuery.to) : undefined,
    },
    enabled,
  );
  const monthOpsPastQuery = useEmployeeOperations(
    employee.id,
    {
      segment: "past",
      page: 1,
      limit: 1,
      dateFrom: monthQuery.from ? dateInputToIsoStart(monthQuery.from) : undefined,
      dateTo: monthQuery.to ? dateInputToIsoEnd(monthQuery.to) : undefined,
    },
    enabled,
  );

  const statisticsQuery = useStatisticsSummary(
    {
      dateFrom: monthQuery.from ? dateInputToIsoStart(monthQuery.from) : undefined,
      dateTo: monthQuery.to ? dateInputToIsoEnd(monthQuery.to) : undefined,
      employeeIds: [employee.id],
    },
    { enabled },
  );

  const { companyId, enabled: scopeEnabled } = useOperationalQueryEnabled();
  const availabilityQuery = useQuery({
    queryKey: ["employees", companyId, employee.id, "operational-availability"],
    queryFn: ({ signal }) => getEmployeeOperationalAvailability(employee.id, { signal }),
    enabled: scopeEnabled && enabled,
  });

  const nextOperation = activeOpsQuery.data?.data[0] ?? null;
  const lastOperation = pastOpsQuery.data?.data[0] ?? null;
  const activeCount = activeOpsCountQuery.data?.meta.total ?? 0;
  const monthOpsCount =
    (monthOpsActiveQuery.data?.meta.total ?? 0) + (monthOpsPastQuery.data?.meta.total ?? 0);
  const monthAttendance = statisticsQuery.data?.presentWorkdays ?? null;
  const upcomingAbsencesCount = availabilityQuery.data?.nextApprovedAbsence ? 1 : 0;

  return (
    <Stack gap="md">
      <SectionCard title="Información general">
        <DetailFieldGrid
          fields={[
            { label: "Nombre", value: employee.name },
            { label: "Documento", value: safeText(employee.documentNumber) },
            { label: "Teléfono", value: employee.phoneNumber },
            {
              label: `Tipo de ${terminology.worker.singular.toLowerCase()}`,
              value: employeeTypeLabels[employee.employeeType],
            },
            { label: "Categoría", value: safeText(employee.category?.name ?? null) },
            ...(canManage
              ? [
                  {
                    label: "Zona de residencia",
                    value: safeText(
                      employee.locationZone
                        ? employee.locationZone.locality
                          ? `${employee.locationZone.name} (${employee.locationZone.locality})`
                          : employee.locationZone.name
                        : null,
                    ),
                  },
                ]
              : []),
            {
              label: "Estado",
              value: (
                <StatusBadge
                  label={activeStatusLabel(employee.active)}
                  tone={employee.active ? "success" : "neutral"}
                />
              ),
            },
          ]}
        />
      </SectionCard>

      <SectionCard title="Disponibilidad operacional">
        <EmployeeOperationalAvailabilityCard employeeId={employee.id} />
      </SectionCard>

      <SectionCard title="Actividad resumida">
        <SimpleGrid cols={{ base: 1, xs: 2, md: 3 }} spacing="md">
          <SummaryMetric
            label="Próxima operación"
            value={
              nextOperation
                ? `${nextOperation.serviceName} · ${formatDateTime(nextOperation.scheduledStart)}`
                : "Sin operaciones activas"
            }
          />
          <SummaryMetric
            label="Última operación"
            value={
              lastOperation
                ? `${lastOperation.serviceName} · ${formatDateTime(lastOperation.scheduledStart)}`
                : "Sin historial"
            }
          />
          <SummaryMetric
            label="Operaciones activas"
            value={activeOpsQuery.isLoading ? "…" : String(activeCount)}
          />
          <SummaryMetric
            label="Operaciones este mes"
            value={
              monthOpsActiveQuery.isLoading || monthOpsPastQuery.isLoading
                ? "…"
                : String(monthOpsCount)
            }
          />
          <SummaryMetric
            label="Asistencias este mes"
            value={
              statisticsQuery.isLoading
                ? "…"
                : monthAttendance === null
                  ? "—"
                  : String(monthAttendance)
            }
          />
          <SummaryMetric
            label="Ausencias próximas"
            value={
              availabilityQuery.isLoading
                ? "…"
                : upcomingAbsencesCount > 0
                  ? String(upcomingAbsencesCount)
                  : "Ninguna"
            }
          />
        </SimpleGrid>
      </SectionCard>
    </Stack>
  );
}
