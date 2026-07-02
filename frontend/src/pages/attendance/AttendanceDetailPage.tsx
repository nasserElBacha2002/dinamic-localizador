import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Card,
  CardContent,
  Stack,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Button, Group } from "@mantine/core";
import { useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { ReviewAttendanceDialog } from "../../components/attendance/ReviewAttendanceDialog";
import { DataTable } from "../../components/common/DataTable";
import { DetailFieldGrid } from "../../components/common/DetailFieldGrid";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import {
  useAttendanceRecord,
  useAttendanceReviews,
  useReviewAttendanceRecord,
} from "../../hooks/useAttendance";
import { usePaginationState } from "../../hooks/usePaginationState";
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
  const pagination = usePaginationState(10);
  const attendanceQuery = useAttendanceRecord(id);
  const reviewsQuery = useAttendanceReviews(id, pagination.page, pagination.pageSize);
  const reviewMutation = useReviewAttendanceRecord(id ?? "");

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [feedback, setFeedback] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  if (!id) {
    return (
      <ErrorState message="Registro no encontrado." />
    );
  }

  if (attendanceQuery.isLoading) {
    return (
      <LoadingState />
    );
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

  return (
    <>
      <PageHeader
        title="Detalle de asistencia"
        description={`${record.employee.name} · Llegada ${formatDateTime(record.receivedAt)}${record.checkoutAt ? ` · Salida ${formatDateTime(record.checkoutAt)}` : ""}`}
        action={
          <Group gap="xs">
            {canReview ? (
              <>
                <Button
                  onClick={() => {
                    setReviewDecision("APPROVE");
                    setReviewDialogOpen(true);
                  }}
                >
                  Aprobar asistencia
                </Button>
                <Button
                  color="danger"
                  variant="default"
                  onClick={() => {
                    setReviewDecision("REJECT");
                    setReviewDialogOpen(true);
                  }}
                >
                  Rechazar asistencia
                </Button>
              </>
            ) : null}
            <Button component={RouterLink} to="/attendance" variant="default">
              Volver
            </Button>
          </Group>
        }
      />

      <Stack spacing={3}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Información general
            </Typography>
            <DetailFieldGrid
              fields={[
                {
                  label: terminology.worker.singular,
                  value: `${record.employee.name} (${record.employee.phoneNumber})`,
                },
                { label: terminology.location.singular, value: record.store.name },
                {
                  label: `${terminology.operation.singular} programada`,
                  value: formatDateTime(record.inventory.scheduledStart),
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
                  value: record.store.allowedRadiusMeters != null ? `${record.store.allowedRadiusMeters} m` : "—",
                },
                {
                  label: "Estado llegada",
                  value: (
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                      <StatusChip label={validationStatusLabels[record.validationStatus]} />
                      <StatusChip label={locationStatusLabels[record.locationStatus]} />
                      <StatusChip label={punctualityStatusLabels[record.punctualityStatus]} />
                      {record.isSimulation ? <StatusChip label="Simulación" /> : null}
                    </Stack>
                  ),
                },
                {
                  label: "Estado salida",
                  value: record.checkoutStatus ? (
                    <StatusChip label={checkoutStatusLabels[record.checkoutStatus]} />
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
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Historial de revisión
            </Typography>

            <DataTable
              isLoading={reviewsQuery.isLoading}
              isError={reviewsQuery.isError}
              errorMessage={getApiErrorMessage(reviewsQuery.error, "No se pudo cargar el historial.")}
              isEmpty={!reviewsQuery.isLoading && reviews.length === 0}
              emptyTitle="Sin revisiones"
              emptyDescription="Todavía no hay revisiones registradas para esta asistencia."
              meta={reviewsMeta}
              pageSize={pagination.pageSize}
              onPageChange={pagination.onPageChange}
              onPageSizeChange={pagination.onPageSizeChange}
              showPageSizeSelector
              head={
                <TableHead>
                  <TableRow>
                    <TableCell>Decisión</TableCell>
                    <TableCell>Revisor</TableCell>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Motivo</TableCell>
                  </TableRow>
                </TableHead>
              }
            >
              {reviews.map((review) => (
                <TableRow key={review.id}>
                  <TableCell>{review.decision === "APPROVE" ? "Aprobada" : "Rechazada"}</TableCell>
                  <TableCell>{review.reviewer?.name ?? review.reviewedBy}</TableCell>
                  <TableCell>{formatDateTime(review.createdAt)}</TableCell>
                  <TableCell>{review.reason}</TableCell>
                </TableRow>
              ))}
            </DataTable>
          </CardContent>
        </Card>

        <Accordion>
          <AccordionSummary expandIcon={<Typography>▼</Typography>}>
            <Typography>Detalles técnicos</Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Stack spacing={1}>
              <Typography>MessageSid: {record.technical.sourceMessageSid ?? "—"}</Typography>
              <Typography>Teléfono: {record.technical.phoneNumber ?? "—"}</Typography>
              <Typography>
                Mensaje: {record.technical.message?.body ?? "—"} ({record.technical.message?.messageType ?? "—"})
              </Typography>
              <Typography>
                Fecha del mensaje:{" "}
                {record.technical.message?.createdAt ? formatDateTime(record.technical.message.createdAt) : "—"}
              </Typography>
              <Typography>
                Estado de procesamiento: {record.technical.message?.processingStatus ?? "—"}
              </Typography>
              <Typography>
                Sesión: {record.technical.session?.state ?? "—"} · expira{" "}
                {record.technical.session?.expiresAt ? formatDateTime(record.technical.session.expiresAt) : "—"}
              </Typography>
              <Typography>
                Coordenadas: {record.technical.coordinates.latitude}, {record.technical.coordinates.longitude}
              </Typography>
              <Typography>Distancia calculada: {record.technical.distanceMeters.toFixed(1)} m</Typography>
              <Typography>Razón de validación: {record.technical.validationReason ?? "—"}</Typography>
            </Stack>
          </AccordionDetails>
        </Accordion>
      </Stack>

      <ReviewAttendanceDialog
        open={reviewDialogOpen}
        decision={reviewDecision}
        loading={reviewMutation.isPending}
        onClose={() => setReviewDialogOpen(false)}
        onConfirm={async (input) => {
          try {
            await reviewMutation.mutateAsync(input);
            setReviewDialogOpen(false);
            setFeedback({
              open: true,
              message: "Revisión registrada correctamente.",
              severity: "success",
            });
          } catch (error) {
            setFeedback({ open: true, message: getApiErrorMessage(error), severity: "error" });
          }
        }}
      />

      <FeedbackSnackbar
        open={feedback.open}
        message={feedback.message}
        severity={feedback.severity}
        onClose={() => setFeedback((current) => ({ ...current, open: false }))}
      />
    </>
  );
}
