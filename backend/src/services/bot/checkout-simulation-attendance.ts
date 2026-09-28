import type { AttendanceRecord } from "../../types/domain";
import type { VirtualAttendanceRecord } from "../../utils/bot-runtime-context";

/**
 * Hydrates a durable-shaped AttendanceRecord from a dry-run virtual check-in.
 * Keeps simulation mapping out of the WhatsApp checkout orchestrator.
 */
export const attendanceRecordFromVirtualCheckIn = (
  virtual: VirtualAttendanceRecord,
  input: {
    simulationSessionId: string | null;
    receivedLatitude?: number;
    receivedLongitude?: number;
  },
): AttendanceRecord => ({
  id: virtual.id,
  operationId: virtual.operationId,
  employeeId: virtual.employeeId,
  employeeWorkdayId: virtual.employeeWorkdayId,
  receivedLatitude: input.receivedLatitude ?? 0,
  receivedLongitude: input.receivedLongitude ?? 0,
  distanceMeters: virtual.distanceMeters,
  validationStatus: virtual.validationStatus,
  locationStatus: virtual.locationStatus,
  punctualityStatus: virtual.punctualityStatus,
  sourceMessageSid: null,
  validationReason: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewReason: null,
  receivedAt: virtual.receivedAt,
  checkoutAt: virtual.checkoutAt,
  checkoutLatitude: null,
  checkoutLongitude: null,
  checkoutDistanceMeters: null,
  checkoutStatus: null,
  checkoutReviewReason: null,
  earlyDepartureMinutes: null,
  extraWorkedMinutes: null,
  checkoutMessageSid: null,
  arrivalSource: null,
  checkoutSource: null,
  arrivalRegisteredBy: null,
  arrivalRegisteredAt: null,
  checkoutRegisteredBy: null,
  checkoutRegisteredAt: null,
  isSimulation: true,
  simulationSessionId: input.simulationSessionId,
  createdAt: virtual.receivedAt,
});
