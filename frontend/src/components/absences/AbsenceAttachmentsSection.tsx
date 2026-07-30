import {
  Alert,
  Button,
  FileButton,
  Group,
  Progress,
  Stack,
  Text,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useMemo, useState } from "react";
import {
  DataTable,
  LoadingState,
  SectionCard,
  StatusBadge,
  type DataTableColumn,
  type DataTableMobileCardConfig,
} from "../../design-system";
import { useAbsenceAttachments } from "../../hooks/useAbsenceAttachments";
import type {
  AbsenceAttachmentPolicy,
  AbsenceRequestAttachmentDto,
  AbsenceRequestStatus,
} from "../../types/absence";
import {
  absenceAttachmentStatusLabels,
  formatAttachmentSize,
} from "../../utils/absence-labels";
import { formatDateTime } from "../../utils/dates";
import { getApiErrorMessage } from "../../utils/errors";
import { triggerBlobDownload } from "../../utils/import-file";

const ACCEPTED_TYPES = "application/pdf,image/jpeg,image/png,image/webp";

interface AbsenceAttachmentsSectionProps {
  requestId: string;
  requestStatus: AbsenceRequestStatus;
  attachmentPolicy?: AbsenceAttachmentPolicy | null;
  canManage: boolean;
}

function resolvePolicy(
  policy: AbsenceAttachmentPolicy | null | undefined,
): AbsenceAttachmentPolicy {
  return policy ?? "OPTIONAL";
}

export function AbsenceAttachmentsSection({
  requestId,
  requestStatus,
  attachmentPolicy,
  canManage,
}: AbsenceAttachmentsSectionProps) {
  const policy = resolvePolicy(attachmentPolicy);
  const editable =
    canManage && (requestStatus === "PENDING" || requestStatus === "NEEDS_INFO");
  const canUpload = editable && policy !== "FORBIDDEN";

  const { listQuery, uploadMutation, deleteMutation, downloadMutation } =
    useAbsenceAttachments(requestId, canManage);

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const rows = useMemo(
    () => (listQuery.data ?? []).filter((row) => row.status !== "DELETED"),
    [listQuery.data],
  );

  const handleUpload = async (file: File | null) => {
    if (!file || !canUpload) {
      return;
    }
    setUploadProgress(0);
    try {
      await uploadMutation.mutateAsync({
        file,
        onUploadProgress: setUploadProgress,
      });
      notifications.show({ color: "green", message: "Archivo adjuntado correctamente." });
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    } finally {
      setUploadProgress(null);
    }
  };

  const handleDownload = async (row: AbsenceRequestAttachmentDto) => {
    setDownloadingId(row.id);
    try {
      const { blob, fileName, contentType } = await downloadMutation.mutateAsync({
        attachmentId: row.id,
      });
      const typedBlob =
        blob.type === contentType ? blob : new Blob([blob], { type: contentType });
      const canPreview =
        contentType.startsWith("image/") || contentType === "application/pdf";
      if (canPreview) {
        const url = URL.createObjectURL(typedBlob);
        const opened = window.open(url, "_blank", "noopener,noreferrer");
        if (!opened) {
          triggerBlobDownload(typedBlob, fileName || row.normalizedFileName || row.originalFileName);
        } else {
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
      } else {
        triggerBlobDownload(
          typedBlob,
          fileName || row.normalizedFileName || row.originalFileName,
        );
      }
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDelete = async (row: AbsenceRequestAttachmentDto) => {
    if (!editable) {
      return;
    }
    setDeletingId(row.id);
    try {
      await deleteMutation.mutateAsync(row.id);
      notifications.show({ color: "green", message: "Adjunto eliminado." });
    } catch (error) {
      notifications.show({ color: "red", message: getApiErrorMessage(error) });
    } finally {
      setDeletingId(null);
    }
  };

  const columns = useMemo<DataTableColumn<AbsenceRequestAttachmentDto>[]>(
    () => [
      {
        key: "name",
        header: "Nombre",
        getValue: (row) => row.originalFileName,
      },
      {
        key: "size",
        header: "Tamaño",
        getValue: (row) => formatAttachmentSize(row.sizeBytes),
      },
      {
        key: "type",
        header: "Tipo",
        getValue: (row) => row.detectedContentType || "—",
      },
      {
        key: "status",
        header: "Estado",
        render: (row) => (
          <StatusBadge
            label={absenceAttachmentStatusLabels[row.status] ?? row.status}
            tone="neutral"
            variant="light"
          />
        ),
      },
      {
        key: "date",
        header: "Fecha",
        getValue: (row) => formatDateTime(row.createdAt),
      },
      {
        key: "actions",
        header: "Acciones",
        align: "right",
        render: (row) => (
          <Group gap="xs" justify="flex-end" wrap="nowrap">
            <Button
              size="compact-xs"
              variant="light"
              onClick={() => void handleDownload(row)}
              loading={downloadingId === row.id}
              disabled={row.status !== "AVAILABLE" && row.status !== "QUARANTINED"}
            >
              Descargar
            </Button>
            {editable ? (
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                onClick={() => void handleDelete(row)}
                loading={deletingId === row.id}
              >
                Eliminar
              </Button>
            ) : null}
          </Group>
        ),
      },
    ],
    [deletingId, downloadingId, editable],
  );

  const mobileCard = useMemo<DataTableMobileCardConfig<AbsenceRequestAttachmentDto>>(
    () => ({
      title: (row) => row.originalFileName,
      status: (row) => (
        <StatusBadge
          label={absenceAttachmentStatusLabels[row.status] ?? row.status}
          tone="neutral"
          variant="light"
        />
      ),
      fields: [
        {
          key: "size",
          label: "Tamaño",
          getValue: (row) => formatAttachmentSize(row.sizeBytes),
          visibility: "always",
        },
        {
          key: "type",
          label: "Tipo",
          getValue: (row) => row.detectedContentType || "—",
          visibility: "always",
        },
        {
          key: "date",
          label: "Fecha",
          getValue: (row) => formatDateTime(row.createdAt),
          visibility: "always",
        },
      ],
      actions: (row) => (
        <Group gap="xs">
          <Button
            size="compact-xs"
            variant="light"
            onClick={() => void handleDownload(row)}
            loading={downloadingId === row.id}
            disabled={row.status !== "AVAILABLE" && row.status !== "QUARANTINED"}
          >
            Descargar
          </Button>
          {editable ? (
            <Button
              size="compact-xs"
              variant="subtle"
              color="red"
              onClick={() => void handleDelete(row)}
              loading={deletingId === row.id}
            >
              Eliminar
            </Button>
          ) : null}
        </Group>
      ),
    }),
    [deletingId, downloadingId, editable],
  );

  if (!canManage) {
    return null;
  }

  return (
    <SectionCard
      title="Documentación adjunta"
      description={
        policy === "REQUIRED"
          ? "Este tipo de ausencia requiere al menos un adjunto."
          : policy === "FORBIDDEN"
            ? "Este tipo de ausencia no admite adjuntos."
            : "Podés adjuntar PDF o imágenes (JPEG, PNG, WebP)."
      }
      action={
        canUpload ? (
          <FileButton onChange={(file) => void handleUpload(file)} accept={ACCEPTED_TYPES}>
            {(props) => (
              <Button {...props} size="xs" loading={uploadMutation.isPending}>
                Subir archivo
              </Button>
            )}
          </FileButton>
        ) : undefined
      }
    >
      <Stack gap="md">
        {uploadProgress != null ? (
          <Stack gap={4}>
            <Text size="sm">Subiendo archivo… {uploadProgress}%</Text>
            <Progress value={uploadProgress} animated />
          </Stack>
        ) : null}

        {listQuery.isLoading ? <LoadingState /> : null}

        {listQuery.isError ? (
          <Alert color="red">{getApiErrorMessage(listQuery.error)}</Alert>
        ) : null}

        {!listQuery.isLoading && !listQuery.isError && rows.length === 0 ? (
          <Text c="dimmed" size="sm">
            {policy === "FORBIDDEN"
              ? "No se permiten adjuntos para este tipo."
              : "No hay documentación adjunta."}
          </Text>
        ) : null}

        {!listQuery.isLoading && !listQuery.isError && rows.length > 0 ? (
          <DataTable
            rows={rows}
            columns={columns}
            getRowKey={(row) => row.id}
            mobileView="cards"
            mobileCard={mobileCard}
            aria-label="Documentación adjunta de la solicitud"
          />
        ) : null}
      </Stack>
    </SectionCard>
  );
}
