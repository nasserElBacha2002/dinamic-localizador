import type { BotRuntimeSettings } from "../../types/bot-runtime-settings";
import {
  combineAttendanceValidation,
  evaluatePunctuality,
  type AttendanceValidationResult,
} from "../../utils/attendance-validation";
import {
  combineCheckoutValidation,
  evaluateCheckoutTime,
  type CheckoutValidationResult,
} from "../../utils/checkout-validation";
import { evaluateAttendanceGeofence } from "./bot-geofence.validator";

export function buildCheckInValidation(input: {
  employeeLatitude: number;
  employeeLongitude: number;
  serviceLatitude: number;
  serviceLongitude: number;
  serviceAllowedRadiusMeters: number;
  receivedAt: Date;
  scheduledStart: Date;
  earlyToleranceMinutes: number;
  lateToleranceMinutes: number;
  runtimeSettings: BotRuntimeSettings;
}): {
  validation: AttendanceValidationResult;
  distanceMeters: number;
  effectiveRadiusMeters: number;
} {
  const effectiveRadiusMeters =
    input.serviceAllowedRadiusMeters > 0
      ? input.serviceAllowedRadiusMeters
      : input.runtimeSettings.defaultRadiusMeters;

  const geo = evaluateAttendanceGeofence({
    employeeLatitude: input.employeeLatitude,
    employeeLongitude: input.employeeLongitude,
    serviceLatitude: input.serviceLatitude,
    serviceLongitude: input.serviceLongitude,
    allowedRadiusMeters: effectiveRadiusMeters,
    reviewMarginMeters: input.runtimeSettings.geofenceReviewMarginMeters,
    defaultRadiusMeters: input.runtimeSettings.defaultRadiusMeters,
  });

  const time = evaluatePunctuality(
    input.receivedAt,
    input.scheduledStart,
    input.earlyToleranceMinutes,
    input.lateToleranceMinutes,
    input.runtimeSettings.lateGraceMinutes,
  );

  return {
    validation: combineAttendanceValidation(geo, time),
    distanceMeters: geo.distanceMeters,
    effectiveRadiusMeters,
  };
}

export function buildCheckoutValidation(input: {
  employeeLatitude: number;
  employeeLongitude: number;
  serviceLatitude: number;
  serviceLongitude: number;
  serviceAllowedRadiusMeters: number;
  checkoutAt: Date;
  scheduledEnd: Date | null;
  runtimeSettings: BotRuntimeSettings;
}): {
  validation: CheckoutValidationResult;
  distanceMeters: number;
  effectiveRadiusMeters: number;
} {
  const effectiveRadiusMeters =
    input.serviceAllowedRadiusMeters > 0
      ? input.serviceAllowedRadiusMeters
      : input.runtimeSettings.defaultRadiusMeters;

  const geo = evaluateAttendanceGeofence({
    employeeLatitude: input.employeeLatitude,
    employeeLongitude: input.employeeLongitude,
    serviceLatitude: input.serviceLatitude,
    serviceLongitude: input.serviceLongitude,
    allowedRadiusMeters: effectiveRadiusMeters,
    reviewMarginMeters: input.runtimeSettings.geofenceReviewMarginMeters,
    defaultRadiusMeters: input.runtimeSettings.defaultRadiusMeters,
  });

  const timeEvaluation = evaluateCheckoutTime(
    input.checkoutAt,
    input.scheduledEnd,
    input.runtimeSettings.earlyLeaveToleranceMinutes,
  );

  return {
    validation: combineCheckoutValidation(geo, timeEvaluation),
    distanceMeters: geo.distanceMeters,
    effectiveRadiusMeters,
  };
}

export function buildCheckoutValidationWithoutLocation(input: {
  checkoutAt: Date;
  scheduledEnd: Date | null;
  runtimeSettings: BotRuntimeSettings;
}): CheckoutValidationResult {
  const timeEvaluation = evaluateCheckoutTime(
    input.checkoutAt,
    input.scheduledEnd,
    input.runtimeSettings.earlyLeaveToleranceMinutes,
  );

  return {
    checkoutStatus: timeEvaluation.checkoutStatus,
    earlyDepartureMinutes: timeEvaluation.earlyDepartureMinutes,
    extraWorkedMinutes: timeEvaluation.extraWorkedMinutes,
    checkoutReviewReason:
      timeEvaluation.reviewReason ?? "Validación automática de salida exitosa (sin ubicación)",
  };
}
