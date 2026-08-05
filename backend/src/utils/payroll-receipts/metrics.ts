type MetricLabels = {
  operation?: string;
  status?: string;
  errorCode?: string;
  year?: number;
  month?: number;
  /** Masked document (last 4 only) — never full CUIL. */
  documentMasked?: string;
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

export const payrollReceiptMetrics = {
  uploadStarted: (labels?: MetricLabels) => emit("payroll_receipt_upload_started", labels),
  uploadCompleted: (labels?: MetricLabels) => emit("payroll_receipt_upload_completed", labels),
  uploadFailed: (labels?: MetricLabels) => emit("payroll_receipt_upload_failed", labels),
  associated: (labels?: MetricLabels) => emit("payroll_receipt_associated", labels),
  duplicate: (labels?: MetricLabels) => emit("payroll_receipt_duplicate", labels),
  downloadStarted: (labels?: MetricLabels) => emit("payroll_receipt_download_started", labels),
  downloadCompleted: (labels?: MetricLabels) => emit("payroll_receipt_download_completed", labels),
  downloadFailed: (labels?: MetricLabels) => emit("payroll_receipt_download_failed", labels),
  deleteFailed: (labels?: MetricLabels) => emit("payroll_receipt_gcs_delete_failed", labels),
  batchCreated: (labels?: MetricLabels) => emit("payroll_receipt_batch_created", labels),
  notificationCreated: (labels?: MetricLabels) =>
    emit("payroll_receipt_notification_created", labels),
  notificationClaimed: (labels?: MetricLabels) =>
    emit("payroll_receipt_notification_claimed", labels),
  notificationSent: (labels?: MetricLabels) => emit("payroll_receipt_notification_sent", labels),
  notificationFailed: (labels?: MetricLabels) =>
    emit("payroll_receipt_notification_failed", labels),
  notificationRetried: (labels?: MetricLabels) =>
    emit("payroll_receipt_notification_retried", labels),
  notificationCancelled: (labels?: MetricLabels) =>
    emit("payroll_receipt_notification_cancelled", labels),
  queryReceived: (labels?: MetricLabels) => emit("payroll_receipt_query_received", labels),
  queryInvalidPeriod: (labels?: MetricLabels) =>
    emit("payroll_receipt_query_invalid_period", labels),
  queryNotFound: (labels?: MetricLabels) => emit("payroll_receipt_query_not_found", labels),
  queryDelivered: (labels?: MetricLabels) => emit("payroll_receipt_query_delivered", labels),
  queryFailed: (labels?: MetricLabels) => emit("payroll_receipt_query_failed", labels),
};
