import { Accordion, Button, Group, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import { ReviewAttendanceDialog } from "../../components/attendance/ReviewAttendanceDialog";
import {
  ActionMenu,
  DataTable,
  DetailFieldGrid,
  ErrorState,
  LoadingState,
  PageHeader,
  PaginationControls,
  SectionCard,
  StatusBadge,
  mapApiPaginationMeta,
  type ActionMenuItem,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import {
  useAttendanceRecord,
  useAttendanceReviews,
  useReviewAttendanceRecord,
} from "../../hooks/useAttendance";
import { usePaginationState } from "../../hooks/usePaginationState";
// Reviews sub-table on detail page: local pagination only; parent list state lives in /attendance URL.
import type { AttendanceReview } from "../../types/attendance";
import { formatDateTime } from "../../utils/dates";
import { terminology } from "../../domain/terminology";
import { getApiErrorMessage } from "../../utils/errors";
import {
  checkoutStatusLabels,
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";

export function AttendanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { goBackToList } = useListBackNavigation("/attendance");
  const pagination = usePaginationState(10);
  const attendanceQuery = useAttendanceRecord(id);
  const reviewsQuery = useAttendanceReviews(id, pagination.page, pagination.pageSize);
  const reviewMutation = useReviewAttendanceRecord(id ?? "");

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<"APPROVE" | "REJECT">("APPROVE");

  const reviewColumns = useMemo<DataTableColumn<AttendanceReview>[]>(
    () => [
      {
        key: "decision",
        header: "Decisión",
        getValue: (row) => (row.decision === "APPROVE" ? "Aprobada" : "Rechazada"),
      },
      {
        key: "reviewer",
        header: "Revisor",
        getValue: (row) => row.reviewer?.name ?? row.reviewedBy,
      },
      { key: "createdAt", header: "Fecha", getValue: (row) => formatDateTime(row.createdAt) },
      { key: "reason", header: "Motivo", getValue: (row) => row.reason },
    ],
    [],
  );

  const reviewMobileCard = useMemo<DataTableMobileCardConfig<AttendanceReview>>(
    () => ({
      title: (row) => (row.decision === "APPROVE" ? "Aprobada" : "Rechazada"),
      fields: [
        {
          key: "reviewer",
          label: "Revisor",
          getValue: (row) => row.reviewer?.name ?? row.reviewedBy,
          visibility: "always",
        },
        {
          key: "createdAt",
          label: "Fecha",
          getValue: (row) => formatDateTime(row.createdAt),
          visibility: "always",
        },
        {
          key: "reason",
          label: "Motivo",
          getValue: (row) => row.reason,
          visibility: "expanded",
        },
      ],
    }),
    [],
  );

  if (!id) {
    return <ErrorState message="Registro no encontrado." />;
  }

  if (attendanceQuery.isLoading) {
    return <LoadingState />;
  }

  if (attendanceQuery.isError || !attendanceQuery.data) {
    return (
      <ErrorState message={getApiErrorMessage(attendanceQuery.error, "Registro no encontrado.")} />
    );
  }

  const record = attendanceQuery.data;
  const canReview =
    !record.reviewedAt &&
    (record.validationStatus === "PENDING_REVIEW" || record.validationStatus === "REJECTED");

  const reviews = reviewsQuery.data?.data ?? [];
  const reviewsMeta = reviewsQuery.data?.meta;

  const reviewMenuItems: ActionMenuItem[] = canReview
    ? [
        {
          key: "reject",
          label: "Rechazar asistencia",
          destructive: true,
          onClick: () => {
            setReviewDecision("REJECT");
            setReviewDialogOpen(true);
          },
        },
        { key: "back", label: "Volver", onClick: goBackToList },
      ]
    : [];

  return (
    <Stack gap="md">
      <PageHeader
        title="Detalle de asistencia"
        description={`${record.employee.name} · Llegada ${formatDateTime(record.receivedAt)}${record.checkoutAt ? ` · Salida ${formatDateTime(record.checkoutAt)}` : ""}`}
        action={
          <ActionMenu
            primary={
              canReview ? (
                <Button
                  onClick={() => {
                    setReviewDecision("APPROVE");
                    setReviewDialogOpen(true);
                  }}
                >
                  Aprobar asistencia
                </Button>
              ) : (
                <Button variant="default" onClick={goBackToList}>
                  Volver
                </Button>
              )
            }
            items={reviewMenuItems}
            menuLabel="Más acciones de la asistencia"
          />
        }
      />

      <SectionCard title="Información general">
        <DetailFieldGrid
          fields={[
            {
              label: terminology.worker.singular,
              value: `${record.employee.name} (${record.employee.phoneNumber})`,
            },
            { label: terminology.service.singular, value: record.service.name },
            {
              label: `${terminology.operation.singular} programada`,
              value: formatDateTime(record.operation.scheduledStart),
            },
            { label: "Llegada", value: formatDateTime(record.receivedAt) },
            { label: "Salida", value: formatDateTime(record.checkoutAt) },
            {
              label: "Coordenadas llegada",
              value: `${record.receivedLatitude}, ${record.receivedLongitude}`,
            },
            { label: "Distancia llegada", value: `${record.distanceMeters.toFixed(1)} m` },
            {
              label: "Coordenadas salida",
              value:
                record.checkoutLatitude != null && record.checkoutLongitude != null
                  ? `${record.checkoutLatitude}, ${record.checkoutLongitude}`
                  : "—",
            },
            {
              label: "Distancia salida",
              value:
                record.checkoutDistanceMeters != null
                  ? `${record.checkoutDistanceMeters.toFixed(1)} m`
                  : "—",
            },
            {
              label: "Radio permitido",
              value:
                record.service.allowedRadiusMeters != null
                  ? `${record.service.allowedRadiusMeters} m`
                  : "—",
            },
            {
              label: "Estado llegada",
              value: (
                <Group gap="xs" wrap="wrap">
                  <StatusBadge label={validationStatusLabels[record.validationStatus]} tone="neutral" />
                  <StatusBadge label={locationStatusLabels[record.locationStatus]} tone="neutral" />
                  <StatusBadge
                    label={punctualityStatusLabels[record.punctualityStatus]}
                    tone="neutral"
                  />
                  {record.isSimulation ? <StatusBadge label="Simulación" tone="info" /> : null}
                </Group>
              ),
            },
            {
              label: "Estado salida",
              value: record.checkoutStatus ? (
                <StatusBadge label={checkoutStatusLabels[record.checkoutStatus]} tone="neutral" />
              ) : (
                "—"
              ),
            },
            { label: "Motivo original", value: record.validationReason ?? "—" },
            { label: "Motivo salida", value: record.checkoutReviewReason ?? "—" },
            {
              label: "Revisado",
              value: record.reviewedAt ? formatDateTime(record.reviewedAt) : "—",
            },
            { label: "Motivo de revisión", value: record.reviewReason ?? "—" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Historial de revisión">
        <DataTable
          rows={reviews}
          columns={reviewColumns}
          getRowKey={(row) => row.id}
          loading={reviewsQuery.isLoading}
          error={
            reviewsQuery.isError
              ? getApiErrorMessage(reviewsQuery.error, "No se pudo cargar el historial.")
              : undefined
          }
          emptyTitle="Sin revisiones"
          emptyDescription="Todavía no hay revisiones registradas para esta asistencia."
          mobileView="summary"
          mobileCard={reviewMobileCard}
          aria-label="Historial de revisión de asistencia"
        />
        {reviewsMeta ? (
          <PaginationControls
            meta={mapApiPaginationMeta({
              page: reviewsMeta.page,
              limit: reviewsMeta.limit,
              total: reviewsMeta.total,
              totalPages: reviewsMeta.totalPages,
            })}
            onPageChange={pagination.onPageChange}
            pageSize={pagination.pageSize}
            onPageSizeChange={pagination.onPageSizeChange}
            showPageSizeSelector
          />
        ) : null}
      </SectionCard>

      <Accordion variant="contained">
        <Accordion.Item value="technical">
          <Accordion.Control>Detalles técnicos</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Text size="sm">MessageSid: {record.technical.sourceMessageSid ?? "—"}</Text>
              <Text size="sm">Teléfono: {record.technical.phoneNumber ?? "—"}</Text>
              <Text size="sm">
                Mensaje: {record.technical.message?.body ?? "—"} (
                {record.technical.message?.messageType ?? "—"})
              </Text>
              <Text size="sm">
                Fecha del mensaje:{" "}
                {record.technical.message?.createdAt
                  ? formatDateTime(record.technical.message.createdAt)
                  : "—"}
              </Text>
              <Text size="sm">
                Estado de procesamiento: {record.technical.message?.processingStatus ?? "—"}
              </Text>
              <Text size="sm">
                Sesión: {record.technical.session?.state ?? "—"} · expira{" "}
                {record.technical.session?.expiresAt
                  ? formatDateTime(record.technical.session.expiresAt)
                  : "—"}
              </Text>
              <Text size="sm">
                Coordenadas: {record.technical.coordinates.latitude},{" "}
                {record.technical.coordinates.longitude}
              </Text>
              <Text size="sm">
                Distancia calculada: {record.technical.distanceMeters.toFixed(1)} m
              </Text>
              <Text size="sm">Razón de validación: {record.technical.validationReason ?? "—"}</Text>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>

      <ReviewAttendanceDialog
        open={reviewDialogOpen}
        decision={reviewDecision}
        loading={reviewMutation.isPending}
        onClose={() => setReviewDialogOpen(false)}
        onConfirm={async (input) => {
          try {
            await reviewMutation.mutateAsync(input);
            setReviewDialogOpen(false);
            notifications.show({
              color: "green",
              message: "Revisión registrada correctamente.",
            });
          } catch (error) {
            notifications.show({
              color: "red",
              message: getApiErrorMessage(error),
            });
          }
        }}
      />
    </Stack>
  );
}
