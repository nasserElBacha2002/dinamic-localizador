/** Display labels for attendance arrival/checkout timestamps. */
export const ATTENDANCE_ARRIVAL_NOT_RECORDED_LABEL = "Sin registrar";

export const formatAttendanceArrivalLabel = (
  receivedAt: string | null | undefined,
  formatDateTime: (value: string | null | undefined) => string,
): string => {
  if (receivedAt == null || receivedAt === "") {
    return ATTENDANCE_ARRIVAL_NOT_RECORDED_LABEL;
  }
  return formatDateTime(receivedAt);
};
