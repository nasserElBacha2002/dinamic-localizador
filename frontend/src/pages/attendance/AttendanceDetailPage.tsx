import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import { useAttendanceRecord, useReviewAttendanceRecord } from "../../hooks/useAttendance";
import { AdminLayout } from "../../layouts/AdminLayout";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import {
  locationStatusLabels,
  punctualityStatusLabels,
  validationStatusLabels,
} from "../../utils/labels";

export function AttendanceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const attendanceQuery = useAttendanceRecord(id);
  const reviewMutation = useReviewAttendanceRecord(id ?? "");

  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewDecision, setReviewDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [reviewReason, setReviewReason] = useState("");
  const [feedback, setFeedback] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

  if (!id) {
    return (
      <AdminLayout>
        <ErrorState message="Registro no encontrado." />
      </AdminLayout>
    );
  }

  if (attendanceQuery.isLoading) {
    return (
      <AdminLayout>
        <LoadingState />
      </AdminLayout>
    );
  }

  if (attendanceQuery.isError || !attendanceQuery.data) {
    return (
      <AdminLayout>
        <ErrorState message={getApiErrorMessage(attendanceQuery.error, "Registro no encontrado.")} />
      </AdminLayout>
    );
  }

  const record = attendanceQuery.data;
  const canReview =
    !record.reviewedAt &&
    (record.validationStatus === "PENDING_REVIEW" || record.validationStatus === "REJECTED");

  const handleReview = async () => {
    if (!reviewReason.trim()) {
      setFeedback({ open: true, message: "El motivo es obligatorio.", severity: "error" });
      return;
    }

    try {
      await reviewMutation.mutateAsync({
        decision: reviewDecision,
        reason: reviewReason.trim(),
      });
      setReviewDialogOpen(false);
      setReviewReason("");
      setFeedback({ open: true, message: "Revisión registrada correctamente.", severity: "success" });
    } catch (error) {
      setFeedback({ open: true, message: getApiErrorMessage(error), severity: "error" });
    }
  };

  return (
    <AdminLayout>
      <PageHeader
        title="Detalle de asistencia"
        description={`${record.employee.name} · ${formatDateTime(record.receivedAt)}`}
        action={
          <Stack direction="row" spacing={1}>
            {canReview ? (
              <>
                <Button
                  variant="contained"
                  onClick={() => {
                    setReviewDecision("APPROVE");
                    setReviewDialogOpen(true);
                  }}
                >
                  Aprobar asistencia
                </Button>
                <Button
                  color="error"
                  variant="outlined"
                  onClick={() => {
                    setReviewDecision("REJECT");
                    setReviewDialogOpen(true);
                  }}
                >
                  Rechazar asistencia
                </Button>
              </>
            ) : null}
            <Button component={RouterLink} to="/attendance">
              Volver
            </Button>
          </Stack>
        }
      />

      <Stack spacing={3}>
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1.5}>
              <Typography variant="h6">Información general</Typography>
              <Typography>Empleado: {record.employee.name} ({record.employee.phoneNumber})</Typography>
              <Typography>Tienda: {record.store.name}</Typography>
              <Typography>Inventario: {formatDateTime(record.inventory.scheduledStart)}</Typography>
              <Typography>Coordenadas: {record.receivedLatitude}, {record.receivedLongitude}</Typography>
              <Typography>Distancia: {record.distanceMeters.toFixed(1)} m</Typography>
              <Typography>
                Radio permitido: {record.store.allowedRadiusMeters ?? "—"} m
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                <StatusChip label={validationStatusLabels[record.validationStatus]} />
                <StatusChip label={locationStatusLabels[record.locationStatus]} />
                <StatusChip label={punctualityStatusLabels[record.punctualityStatus]} />
              </Stack>
              <Typography>Motivo original: {record.validationReason ?? "—"}</Typography>
              <Typography>Revisado: {record.reviewedAt ? formatDateTime(record.reviewedAt) : "—"}</Typography>
              <Typography>Motivo de revisión: {record.reviewReason ?? "—"}</Typography>
            </Stack>
          </CardContent>
        </Card>

        {record.reviews.length > 0 ? (
          <Card variant="outlined">
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Historial de revisión
              </Typography>
              <Stack spacing={1.5}>
                {record.reviews.map((review) => (
                  <Stack key={review.id} spacing={0.5}>
                    <Typography>
                      {review.decision === "APPROVE" ? "Aprobada" : "Rechazada"} por{" "}
                      {review.reviewer?.name ?? review.reviewedBy}
                    </Typography>
                    <Typography color="text.secondary">{formatDateTime(review.createdAt)}</Typography>
                    <Typography>{review.reason}</Typography>
                  </Stack>
                ))}
              </Stack>
            </CardContent>
          </Card>
        ) : null}

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

      <Dialog open={reviewDialogOpen} onClose={() => setReviewDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>
          {reviewDecision === "APPROVE" ? "Aprobar asistencia" : "Rechazar asistencia"}
        </DialogTitle>
        <DialogContent>
          <TextField
            label="Motivo"
            required
            fullWidth
            multiline
            minRows={3}
            sx={{ mt: 1 }}
            value={reviewReason}
            onChange={(event) => setReviewReason(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReviewDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleReview} disabled={reviewMutation.isPending}>
            Confirmar
          </Button>
        </DialogActions>
      </Dialog>

      <FeedbackSnackbar
        open={feedback.open}
        message={feedback.message}
        severity={feedback.severity}
        onClose={() => setFeedback((current) => ({ ...current, open: false }))}
      />
    </AdminLayout>
  );
}
