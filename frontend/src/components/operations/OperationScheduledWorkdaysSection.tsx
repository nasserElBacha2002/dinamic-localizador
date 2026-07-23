import { Button, Text, Tooltip } from "@mantine/core";
import { useMemo, useState } from "react";
import {
  DataTable,
  ErrorState,
  LoadingState,
  PaginationControls,
  SectionCard,
  StatusBadge,
  mapApiPaginationMeta,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { usePaginationState } from "../../hooks/usePaginationState";
import {
  useMaterializeOperationWorkdays,
  useOperationWorkdays,
} from "../../hooks/useOperations";
import type { OperationWorkdaySummary } from "../../types/operation-workday";
import { getApiErrorMessage } from "../../utils/errors";
import {
  buildMaterializationSuccessMessage,
  formatExpectedTimeRange,
  formatWorkdayDate,
  workdayStatusLabels,
} from "./operation-workday-display";
import { OperationWorkdayDetailModal } from "./OperationWorkdayDetailModal";

interface OperationScheduledWorkdaysSectionProps {
  operationId: string;
  canManage: boolean;
  onFeedback: (message: string, severity: "success" | "error") => void;
}

export function OperationScheduledWorkdaysSection({
  operationId,
  canManage,
  onFeedback,
}: OperationScheduledWorkdaysSectionProps) {
  const pagination = usePaginationState(14);
  const workdaysQuery = useOperationWorkdays(operationId, {
    page: pagination.page,
    limit: pagination.pageSize,
  });
  const materializeMutation = useMaterializeOperationWorkdays(operationId);
  const [selectedWorkday, setSelectedWorkday] = useState<OperationWorkdaySummary | null>(null);

  const handleMaterialize = async () => {
    try {
      const result = await materializeMutation.mutateAsync();
      onFeedback(buildMaterializationSuccessMessage(result), "success");
    } catch (error) {
      onFeedback(getApiErrorMessage(error), "error");
    }
  };

  const rows = workdaysQuery.data?.data ?? [];
  const meta = workdaysQuery.data?.meta;

  const columns = useMemo<DataTableColumn<OperationWorkdaySummary>[]>(
    () => [
      {
        key: "workDate",
        header: "Fecha",
        getValue: (row) => formatWorkdayDate(row.workDate),
      },
      {
        key: "schedule",
        header: "Horario esperado",
        getValue: (row) => formatExpectedTimeRange(row),
      },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={workdayStatusLabels[row.status]}
            tone={row.status === "ACTIVE" ? "info" : "neutral"}
            variant="light"
          />
        ),
      },
      {
        key: "employees",
        header: "Colaboradores",
        getValue: (row) => row.scheduledEmployeesCount,
      },
    ],
    [],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<OperationWorkdaySummary>>(
    () => ({
      title: (row) => formatWorkdayDate(row.workDate),
      status: (row) => (
        <StatusBadge
          label={workdayStatusLabels[row.status]}
          tone={row.status === "ACTIVE" ? "info" : "neutral"}
          variant="light"
        />
      ),
      fields: [
        {
          key: "schedule",
          label: "Horario",
          getValue: (row) => formatExpectedTimeRange(row),
          visibility: "always",
        },
        {
          key: "employees",
          label: "Colaboradores",
          getValue: (row) => String(row.scheduledEmployeesCount),
          visibility: "always",
        },
      ],
    }),
    [],
  );

  return (
    <>
      <SectionCard
        title="Jornadas programadas"
        description="Próximas jornadas según horario y asignaciones vigentes."
        action={
          canManage ? (
            <Tooltip label="Genera y actualiza las próximas jornadas según el horario y las asignaciones vigentes.">
              <Button
                variant="default"
                size="compact-sm"
                loading={materializeMutation.isPending}
                onClick={() => void handleMaterialize()}
              >
                Actualizar jornadas
              </Button>
            </Tooltip>
          ) : undefined
        }
      >
        <Text size="xs" c="dimmed" mb="sm">
          Usá &quot;Ver detalle&quot; para consultar colaboradores y asistencia de cada jornada.
        </Text>

        {workdaysQuery.isLoading ? <LoadingState message="Cargando jornadas..." /> : null}
        {workdaysQuery.isError ? (
          <ErrorState
            message={getApiErrorMessage(workdaysQuery.error, "No se pudieron cargar las jornadas.")}
          />
        ) : null}

        {!workdaysQuery.isLoading && !workdaysQuery.isError ? (
          <DataTable
            rows={rows}
            columns={columns}
            getRowKey={(row) => row.id}
            emptyTitle="Todavía no hay jornadas materializadas para esta operación."
            emptyDescription="Actualizá las jornadas para generar las próximas fechas programadas."
            mobileView="summary"
            mobileCard={mobileCard}
            onRowClick={(row) => setSelectedWorkday(row)}
            rowActions={(row) => (
              <Button
                variant="light"
                size="compact-xs"
                onClick={() => setSelectedWorkday(row)}
              >
                Ver detalle
              </Button>
            )}
            pagination={
              meta ? (
                <PaginationControls
                  meta={mapApiPaginationMeta(meta)}
                  pageSize={pagination.pageSize}
                  onPageChange={pagination.onPageChange}
                  onPageSizeChange={pagination.onPageSizeChange}
                  showPageSizeSelector
                />
              ) : null
            }
            aria-label="Jornadas programadas"
          />
        ) : null}
      </SectionCard>

      <OperationWorkdayDetailModal
        opened={Boolean(selectedWorkday)}
        onClose={() => setSelectedWorkday(null)}
        operationId={operationId}
        workday={selectedWorkday}
      />
    </>
  );
}
