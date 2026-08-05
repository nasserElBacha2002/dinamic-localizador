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
};
