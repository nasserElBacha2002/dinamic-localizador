import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { absenceAttachmentKeys, absenceKeys } from "../api/absence-query-keys";
import {
  deleteAbsenceAttachment,
  downloadAbsenceAttachmentContent,
  getAbsenceAttachmentStorageHealth,
  listAbsenceAttachments,
  uploadAbsenceAttachment,
} from "../api/absences.api";
import { useOperationalQueryEnabled } from "./useOperationalQueryEnabled";

function invalidateAttachmentQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  companyId: string | null | undefined,
  requestId: string,
) {
  if (!companyId) {
    return;
  }
  void queryClient.invalidateQueries({
    queryKey: absenceAttachmentKeys.request(companyId, requestId),
  });
  void queryClient.invalidateQueries({
    queryKey: absenceKeys.detail(companyId, requestId),
  });
}

export function useAbsenceAttachments(requestId?: string, queryEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(
    Boolean(requestId) && queryEnabled,
  );
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: absenceAttachmentKeys.request(companyId, requestId ?? ""),
    queryFn: () => listAbsenceAttachments(requestId!),
    enabled,
  });

  const uploadMutation = useMutation({
    mutationFn: ({
      file,
      onUploadProgress,
    }: {
      file: File;
      onUploadProgress?: (percent: number) => void;
    }) => uploadAbsenceAttachment(requestId!, file, onUploadProgress, crypto.randomUUID()),
    onSuccess: () => {
      invalidateAttachmentQueries(queryClient, companyId, requestId!);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (attachmentId: string) =>
      deleteAbsenceAttachment(requestId!, attachmentId),
    onSuccess: () => {
      invalidateAttachmentQueries(queryClient, companyId, requestId!);
    },
  });

  const downloadMutation = useMutation({
    mutationFn: async ({ attachmentId }: { attachmentId: string }) => {
      return downloadAbsenceAttachmentContent(requestId!, attachmentId);
    },
  });

  return {
    listQuery,
    uploadMutation,
    deleteMutation,
    downloadMutation,
  };
}

export function useAbsenceAttachmentStorageHealth(queryEnabled = true) {
  const { companyId, enabled } = useOperationalQueryEnabled(queryEnabled);

  return useQuery({
    queryKey: absenceAttachmentKeys.storageHealth(companyId),
    queryFn: getAbsenceAttachmentStorageHealth,
    enabled,
  });
}
