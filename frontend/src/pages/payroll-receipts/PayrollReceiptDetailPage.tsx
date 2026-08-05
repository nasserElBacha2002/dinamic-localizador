import { Alert, Button, FileButton, Group, Progress, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { Link as RouterLink, useNavigate, useParams } from "react-router";
import {
  ConfirmDialog,
  DetailFieldGrid,
  ErrorState,
  LoadingState,
  PageHeader,
  SectionCard,
  StatusBadge,
} from "../../design-system";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { useListBackNavigation } from "../../hooks/useListBackNavigation";
import {
  useDeletePayrollReceipt,
  useDownloadPayrollReceipt,
  usePayrollReceipt,
  useReplacePayrollReceipt,
  useReconcilePayrollReceiptAssociation,
} from "../../hooks/usePayrollReceipts";
import { terminology } from "../../domain/terminology";
import { formatDateTime } from "../../utils/dates";
import { safeText } from "../../utils/display-safe";
import { getApiErrorMessage } from "../../utils/errors";
import { triggerBlobDownload } from "../../utils/import-file";
import {
  formatCuilDisplay,
  formatPayrollPeriod,
  payrollReceiptStatusLabels,
  payrollReceiptStatusTone,
} from "../../utils/payroll-receipt-labels";
import { hasPermission } from "../../utils/permissions";

const FAILED_RETRY_STATUSES = new Set([
  "UPLOAD_FAILED",
  "FAILED",
  "DOCUMENT_NOT_FOUND",
  "INVALID_DOCUMENT",
  "AMBIGUOUS_DOCUMENT",
  "EMPLOYEE_NOT_FOUND",
  "EMPLOYEE_DOCUMENT_AMBIGUOUS",
]);

export function PayrollReceiptDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { goBackToList } = useListBackNavigation("/payroll-receipts");
  const permissionsQuery = useCompanyPermissions();
  const receiptQuery = usePayrollReceipt(id);

  const canDownload = hasPermission(
    permissionsQuery.data?.permissions,
    "payroll_receipts:download",
  );
  const canManage = hasPermission(
    permissionsQuery.data?.permissions,
    "payroll_receipts:manage",
  );
  const canDelete = hasPermission(
    permissionsQuery.data?.permissions,
    "payroll_receipts:delete",
  );
  const canUpload = hasPermission(
    permissionsQuery.data?.permissions,
    "payroll_receipts:upload",
  );

  const downloadMutation = useDownloadPayrollReceipt();
  const replaceMutation = useReplacePayrollReceipt(id ?? "");
  const deleteMutation = useDeletePayrollReceipt();
  const reconcileMutation = useReconcilePayrollReceiptAssociation(id ?? "");

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [replaceProgress, setReplaceProgress] = useState<number | null>(null);
  const [contentBusy, setContentBusy] = useState<"view" | "download" | null>(null);

  if (!id) {
    return <ErrorState message="Recibo no encontrado." />;
  }

  if (receiptQuery.isLoading || permissionsQuery.isPending) {
    return <LoadingState />;
  }

  if (receiptQuery.isError || !receiptQuery.data) {
    return (
      <ErrorState message={getApiErrorMessage(receiptQuery.error, "Recibo no encontrado.")} />
    );
  }

  const receipt = receiptQuery.data;
  const canReconcile =
    canUpload && FAILED_RETRY_STATUSES.has(receipt.status) && receipt.status !== "DELETED";
  const canOpenFile = canDownload && receipt.hasFile;

  const openOrDownload = async (disposition: "inline" | "attachment") => {
    setContentBusy(disposition === "inline" ? "view" : "download");
    try {
      const { blob, fileName, contentType } = await downloadMutation.mutateAsync({
        receiptId: id,
        disposition,
      });
      const typedBlob =
        blob.type === contentType ? blob : new Blob([blob], { type: contentType });
      if (disposition === "inline") {
        const url = URL.createObjectURL(typedBlob);
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) {
          triggerBlobDownload(typedBlob, fileName || receipt.originalFilename);
        } else {
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
      } else {
        triggerBlobDownload(typedBlob, fileName || receipt.originalFilename);
      }
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    } finally {
      setContentBusy(null);
    }
  };

  const handleReplace = async (file: File | null) => {
    if (!file || !canManage) {
      return;
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      notifications.show({ color: "red", message: "Solo se admiten archivos PDF." });
      return;
    }
    setReplaceProgress(0);
    try {
      await replaceMutation.mutateAsync({
        file,
        idempotencyKey: crypto.randomUUID(),
        onUploadProgress: setReplaceProgress,
      });
      notifications.show({ color: "green", message: "Recibo reemplazado correctamente." });
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    } finally {
      setReplaceProgress(null);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(id);
      notifications.show({ color: "green", message: "Recibo eliminado." });
      setDeleteOpen(false);
      navigate("/payroll-receipts");
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    }
  };

  const handleReconcile = async () => {
    try {
      await reconcileMutation.mutateAsync();
      notifications.show({ color: "green", message: "Asociación revalidada." });
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    }
  };

  return (
    <Stack gap="md">
      <PageHeader
        title={receipt.originalFilename}
        description={`Recibo de sueldo · ${formatPayrollPeriod(receipt.year, receipt.month)}`}
        action={
          <Group gap="sm">
            {canOpenFile ? (
              <>
                <Button
                  variant="light"
                  loading={contentBusy === "view"}
                  onClick={() => void openOrDownload("inline")}
                >
                  Ver
                </Button>
                <Button
                  variant="light"
                  loading={contentBusy === "download"}
                  onClick={() => void openOrDownload("attachment")}
                >
                  Descargar
                </Button>
              </>
            ) : null}
            {canManage ? (
              <FileButton onChange={(file) => void handleReplace(file)} accept="application/pdf">
                {(props) => (
                  <Button {...props} variant="light" loading={replaceMutation.isPending}>
                    Reemplazar
                  </Button>
                )}
              </FileButton>
            ) : null}
            {canReconcile ? (
              <Button
                variant="light"
                loading={reconcileMutation.isPending}
                onClick={() => void handleReconcile()}
              >
                Revalidar asociación
              </Button>
            ) : null}
            {canDelete && receipt.status !== "DELETED" ? (
              <Button color="red" variant="light" onClick={() => setDeleteOpen(true)}>
                Eliminar
              </Button>
            ) : null}
            <Button variant="default" onClick={goBackToList}>
              Volver al listado
            </Button>
          </Group>
        }
      />

      {replaceProgress != null ? (
        <Stack gap={4}>
          <Text size="sm">Reemplazando archivo… {replaceProgress}%</Text>
          <Progress value={replaceProgress} animated />
        </Stack>
      ) : null}

      {receipt.errorMessage ? <Alert color="red">{receipt.errorMessage}</Alert> : null}

      <SectionCard title="Información del recibo">
        <DetailFieldGrid
          fields={[
            {
              label: "Estado",
              value: (
                <StatusBadge
                  label={payrollReceiptStatusLabels[receipt.status]}
                  tone={payrollReceiptStatusTone(receipt.status)}
                  variant="light"
                />
              ),
            },
            {
              label: "Período",
              value: formatPayrollPeriod(receipt.year, receipt.month),
            },
            {
              label: terminology.worker.singular,
              value: safeText(receipt.employeeName ?? null),
            },
            {
              label: "CUIL",
              value: formatCuilDisplay(receipt.normalizedDocument ?? receipt.detectedDocument),
            },
            {
              label: "Archivo",
              value: receipt.originalFilename,
            },
            {
              label: "Tamaño",
              value:
                receipt.fileSize != null
                  ? receipt.fileSize < 1024 * 1024
                    ? `${(receipt.fileSize / 1024).toFixed(1)} KB`
                    : `${(receipt.fileSize / (1024 * 1024)).toFixed(1)} MB`
                  : "—",
            },
            {
              label: "Cargado",
              value: formatDateTime(receipt.createdAt),
            },
            {
              label: "Actualizado",
              value: formatDateTime(receipt.updatedAt),
            },
          ]}
        />
      </SectionCard>

      {receipt.employeeId ? (
        <Group>
          <Button
            component={RouterLink}
            to={`/employees/${receipt.employeeId}`}
            variant="light"
          >
            Ver {terminology.worker.singular.toLowerCase()}
          </Button>
        </Group>
      ) : null}

      <ConfirmDialog
        open={deleteOpen}
        title="Eliminar recibo"
        description="¿Confirmás eliminar este recibo de sueldo? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        destructive
        loading={deleteMutation.isPending}
        onConfirm={() => void handleDelete()}
        onCancel={() => setDeleteOpen(false)}
      />
    </Stack>
  );
}
