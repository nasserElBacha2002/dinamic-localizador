type MetricLabels = {
  operation?: string;
  source?: string;
  normalizedMime?: string;
  errorCode?: string;
  status?: string;
};

const emit = (name: string, labels: MetricLabels = {}): void => {
  console.info(
    JSON.stringify({
      metric: name,
      ...labels,
      ts: new Date().toISOString(),
    }),
  );
};

export const absenceAttachmentMetrics = {
  uploadStarted: (labels?: MetricLabels) =>
    emit("absence_attachment_gcs_upload_started", labels),
  uploadCompleted: (labels?: MetricLabels) =>
    emit("absence_attachment_gcs_upload_completed", labels),
  uploadFailed: (labels?: MetricLabels) =>
    emit("absence_attachment_gcs_upload_failed", labels),
  downloadStarted: (labels?: MetricLabels) =>
    emit("absence_attachment_gcs_download_started", labels),
  downloadCompleted: (labels?: MetricLabels) =>
    emit("absence_attachment_gcs_download_completed", labels),
  downloadFailed: (labels?: MetricLabels) =>
    emit("absence_attachment_gcs_download_failed", labels),
  deleteFailed: (labels?: MetricLabels) =>
    emit("absence_attachment_gcs_delete_failed", labels),
  orphanDetected: (labels?: MetricLabels) =>
    emit("absence_attachment_gcs_orphan_detected", labels),
  validationRejected: (labels?: MetricLabels) =>
    emit("absence_attachment_validation_rejected", labels),
};
