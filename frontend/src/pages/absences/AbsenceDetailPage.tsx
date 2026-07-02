import {
  Alert,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { Link as RouterLink, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { EmployeeAbsenceBalanceCard } from "../../components/absences/EmployeeAbsenceBalanceCard";
import { EmployeeAbsenceHistoryTable } from "../../components/absences/EmployeeAbsenceHistoryTable";
import { DetailFieldGrid } from "../../components/common/DetailFieldGrid";
import { ErrorState } from "../../components/common/ErrorState";
import { FeedbackSnackbar } from "../../components/common/FeedbackSnackbar";
import { LoadingState } from "../../components/common/LoadingState";
import { PageHeader } from "../../components/common/PageHeader";
import { StatusChip } from "../../components/common/StatusChip";
import {
  useAbsenceRequest,
  useApproveAbsenceRequest,
  useNeedsInfoAbsenceRequest,
  useRejectAbsenceRequest,
} from "../../hooks/useAbsences";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import {
  absenceEventTypeLabels,
  absenceRequestedViaLabels,
  absenceStatusLabels,
  absenceTypeLabels,
  formatAbsenceDate,
} from "../../utils/absence-labels";

export function AbsenceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const requestQuery = useAbsenceRequest(id);
  const approveMutation = useApproveAbsenceRequest(id ?? "");
  const rejectMutation = useRejectAbsenceRequest(id ?? "");
  const needsInfoMutation = useNeedsInfoAbsenceRequest(id ?? "");

  const [rejectOpen, setRejectOpen] = useState(false);
  const [needsInfoOpen, setNeedsInfoOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [feedback, setFeedback] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({
    open: false,
    message: "",
    severity: "success",
  });

  if (!id) {
    return (
      <ErrorState message="Solicitud no encontrada." />
    );
  }

  if (requestQuery.isLoading) {
    return (
      <LoadingState />
    );
  }

  if (requestQuery.isError || !requestQuery.data) {
    return (
      <ErrorState message={getApiErrorMessage(requestQuery.error, "Solicitud no encontrada.")} />
    );
  }

  const request = requestQuery.data;
  const canReview = request.status === "PENDING" || request.status === "NEEDS_INFO";
  const balanceYear =
    request.balanceImpact?.year ?? Number.parseInt(request.startDate.slice(0, 4), 10);
  const insufficientBalance =
    request.balanceImpact?.deductsBalance === true &&
    request.balanceImpact.hasSufficientBalance === false;

  const handleApprove = async () => {
    try {
      await approveMutation.mutateAsync();
      setFeedback({ open: true, message: "Solicitud aprobada.", severity: "success" });
    } catch (error) {
      setFeedback({ open: true, message: getApiErrorMessage(error), severity: "error" });
    }
  };

  const handleReject = async () => {
    if (!comment.trim()) {
      setFeedback({ open: true, message: "El motivo del rechazo es obligatorio.", severity: "error" });
      return;
    }

    try {
      await rejectMutation.mutateAsync(comment.trim());
      setRejectOpen(false);
      setComment("");
      setFeedback({ open: true, message: "Solicitud rechazada.", severity: "success" });
    } catch (error) {
      setFeedback({ open: true, message: getApiErrorMessage(error), severity: "error" });
    }
  };

  const handleNeedsInfo = async () => {
    if (!comment.trim()) {
      setFeedback({
        open: true,
        message: "El comentario es obligatorio.",
        severity: "error",
      });
      return;
    }

    try {
      await needsInfoMutation.mutateAsync(comment.trim());
      setNeedsInfoOpen(false);
      setComment("");
      setFeedback({
        open: true,
        message:
          "La solicitud quedó marcada como requiere información. En esta fase el empleado todavía no será notificado automáticamente.",
        severity: "success",
      });
    } catch (error) {
      setFeedback({ open: true, message: getApiErrorMessage(error), severity: "error" });
    }
  };

  return (
    <>
      <PageHeader
        title="Detalle de solicitud de ausencia"
        description={`${request.employee.name} · ${formatAbsenceDate(request.startDate)} - ${formatAbsenceDate(request.endDate)}`}
        action={
          <Stack direction="row" spacing={1}>
            {canReview ? (
              <>
                {insufficientBalance ? (
                  <Alert severity="info" sx={{ alignSelf: "center" }}>
                    Para aprobar esta solicitud, primero cargá o ajustá el saldo del empleado.
                  </Alert>
                ) : null}
                <Button
                  variant="contained"
                  onClick={handleApprove}
                  disabled={approveMutation.isPending || insufficientBalance}
                >
                  Aprobar
                </Button>
                <Button
                  color="warning"
                  variant="outlined"
                  onClick={() => {
                    setComment("");
                    setNeedsInfoOpen(true);
                  }}
                >
                  Requiere información
                </Button>
                <Button
                  color="error"
                  variant="outlined"
                  onClick={() => {
                    setComment("");
                    setRejectOpen(true);
                  }}
                >
                  Rechazar
                </Button>
              </>
            ) : null}
            <Button component={RouterLink} to="/absences">
              Volver al listado
            </Button>
          </Stack>
        }
      />

      <Stack spacing={3}>
        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Datos generales
            </Typography>
            <DetailFieldGrid
              fields={[
                { label: "Empleado", value: `${request.employee.name} (${request.employee.phoneNumber})` },
                {
                  label: "Tipo",
                  value:
                    absenceTypeLabels[
                      request.absenceType.code as keyof typeof absenceTypeLabels
                    ] ?? request.absenceType.name,
                },
                { label: "Inicio", value: formatAbsenceDate(request.startDate) },
                { label: "Fin", value: formatAbsenceDate(request.endDate) },
                { label: "Días", value: request.totalDays },
                { label: "Motivo", value: request.reason },
                {
                  label: "Estado",
                  value: <StatusChip label={absenceStatusLabels[request.status]} />,
                },
                { label: "Origen", value: absenceRequestedViaLabels[request.requestedVia] },
                { label: "Creada", value: formatDateTime(request.createdAt) },
                { label: "Revisada por", value: request.reviewerName ?? "—" },
                { label: "Revisada el", value: request.reviewedAt ? formatDateTime(request.reviewedAt) : "—" },
                { label: "Comentario de revisión", value: request.reviewComment ?? "—" },
              ]}
            />
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Saldo del empleado
            </Typography>
            <EmployeeAbsenceBalanceCard
              employeeId={request.employeeId}
              year={balanceYear}
              balanceImpact={request.balanceImpact}
              onBalanceSaved={() => {
                if (id) {
                  queryClient.invalidateQueries({ queryKey: ["absence-request", id] });
                }
              }}
            />
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Historial del empleado ({balanceYear})
            </Typography>
            <EmployeeAbsenceHistoryTable employeeId={request.employeeId} year={balanceYear} />
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Inventarios afectados
            </Typography>
            {request.affectedInventories.length === 0 ? (
              <Typography color="text.secondary">
                No se detectaron inventarios asignados que se superpongan con esta ausencia.
              </Typography>
            ) : (
              <Alert severity="warning" sx={{ mb: 2 }}>
                Esta solicitud se superpone con {request.affectedInventories.length} inventario(s)
                asignado(s). Podés aprobar igualmente, pero conviene revisar la planificación.
              </Alert>
            )}
            {request.affectedInventories.length > 0 ? (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Tienda</TableCell>
                      <TableCell>Inicio</TableCell>
                      <TableCell>Fin</TableCell>
                      <TableCell>Estado</TableCell>
                      <TableCell align="right">Acción</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {request.affectedInventories.map((inventory) => (
                      <TableRow key={inventory.inventoryId}>
                        <TableCell>{inventory.storeName}</TableCell>
                        <TableCell>{formatDateTime(inventory.scheduledStart)}</TableCell>
                        <TableCell>
                          {inventory.scheduledEnd ? formatDateTime(inventory.scheduledEnd) : "—"}
                        </TableCell>
                        <TableCell>{inventory.status}</TableCell>
                        <TableCell align="right">
                          <Button
                            component={RouterLink}
                            to={`/inventories/${inventory.inventoryId}`}
                            size="small"
                          >
                            Ver inventario
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : null}
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Historial
            </Typography>
            <Stack spacing={1}>
              {request.events.map((event) => (
                <Typography key={event.id} variant="body2">
                  {formatDateTime(event.createdAt)} ·{" "}
                  {absenceEventTypeLabels[event.eventType as keyof typeof absenceEventTypeLabels] ??
                    event.eventType}
                  {event.performerName ? ` · ${event.performerName}` : ""}
                  {event.comment ? ` · ${event.comment}` : ""}
                </Typography>
              ))}
            </Stack>
          </CardContent>
        </Card>
      </Stack>

      <Dialog open={rejectOpen} onClose={() => setRejectOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Rechazar solicitud</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Motivo del rechazo"
            fullWidth
            multiline
            minRows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRejectOpen(false)}>Cancelar</Button>
          <Button color="error" onClick={handleReject} disabled={rejectMutation.isPending}>
            Rechazar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={needsInfoOpen} onClose={() => setNeedsInfoOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Solicitar más información</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Comentario para el empleado"
            fullWidth
            multiline
            minRows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNeedsInfoOpen(false)}>Cancelar</Button>
          <Button onClick={handleNeedsInfo} disabled={needsInfoMutation.isPending}>
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <FeedbackSnackbar
        open={feedback.open}
        message={feedback.message}
        severity={feedback.severity}
        onClose={() => setFeedback((current) => ({ ...current, open: false }))}
      />
    </>
  );
}
