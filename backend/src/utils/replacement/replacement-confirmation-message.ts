import { formatLocalTime } from "../attendance/attendance-validation";

export const formatReplacementAssignmentConfirmation = (input: {
  candidateName: string;
  serviceName: string;
  workDate: string;
  expectedStartAt: string;
  timezone: string;
}): string => {
  const timeLabel = formatLocalTime(input.expectedStartAt, input.timezone);
  return `✅ Reemplazo asignado.\n\n${input.candidateName} fue asignado a ${input.serviceName} para el ${input.workDate}, ${timeLabel}.`;
};