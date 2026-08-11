type MetricLabels = {
  operation?: string;
  status?: string;
  errorCode?: string;
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

export const operationAssignmentNotificationMetrics = {
  notificationCreated: (labels?: MetricLabels) =>
    emit("operation_assignment_notification_created", labels),
  notificationClaimed: (labels?: MetricLabels) =>
    emit("operation_assignment_notification_claimed", labels),
  notificationSent: (labels?: MetricLabels) =>
    emit("operation_assignment_notification_sent", labels),
  notificationFailed: (labels?: MetricLabels) =>
    emit("operation_assignment_notification_failed", labels),
  notificationRetried: (labels?: MetricLabels) =>
    emit("operation_assignment_notification_retried", labels),
  notificationCancelled: (labels?: MetricLabels) =>
    emit("operation_assignment_notification_cancelled", labels),
};
