import { INVALID_SELECTION_MESSAGE } from "./bot/bot-response.builder";
import { employeeAssignmentQueryRepository } from "../repositories/employee-assignment-query.repository";
import { employeeWorkdayAvailabilityRepository } from "../repositories/employee-workday-availability.repository";
import type { EmployeeAssignedOperation } from "../types/employee-assignment-query";
import type { OperationSelectionOption } from "../types/twilio.types";
import { getBotNow } from "../utils/bot-runtime-context";
import { getBotOperationTimezone } from "../utils/bot-runtime-settings-scope";
import { getDateIsoInTimezone } from "../utils/absence-date";
import {
  formatAssignmentDateTimeLine,
  formatAssignmentServiceReference,
  formatTodayAssignmentBlock,
  formatUpcomingAssignmentBlock,
  formatUpcomingSelectionLine,
  NO_CONFIRMABLE_ASSIGNMENTS_MESSAGE,
  NO_TODAY_ASSIGNMENTS_MESSAGE,
  NO_UNAVAILABILITY_ASSIGNMENTS_MESSAGE,
  NO_UPCOMING_ASSIGNMENTS_MESSAGE,
  PAST_ASSIGNMENT_MESSAGE,
} from "../utils/employee-assignment-format";
import type { AssignmentConfirmationStatus } from "../constants/assignment-confirmation";
import type { PunctualityStatus } from "../types/domain";

const isFutureAssignment = (assignment: EmployeeAssignedOperation, at: Date): boolean =>
  new Date(assignment.scheduledStart).getTime() > at.getTime();

const mapToSelectionOptions = (
  assignments: EmployeeAssignedOperation[],
): OperationSelectionOption[] =>
  assignments.map((assignment) => ({
    operationId: assignment.operationId,
    serviceName: assignment.serviceName,
    serviceAddress: assignment.serviceAddress,
    serviceLocality: assignment.serviceLocality,
    scheduledStart: assignment.scheduledStart,
  }));

const mapTodayWorkdayRow = (
  row: Awaited<
    ReturnType<typeof employeeWorkdayAvailabilityRepository.listTodayWorkdaysForEmployee>
  >[number],
): EmployeeAssignedOperation => ({
  assignmentId: row.assignmentId,
  operationId: row.operationId,
  serviceName: row.serviceName,
  serviceAddress: row.serviceAddress,
  serviceLocality: row.serviceLocality,
  serviceLatitude: row.serviceLatitude,
  serviceLongitude: row.serviceLongitude,
  scheduledStart: row.scheduledStart,
  scheduledEnd: row.scheduledEnd,
  operationStatus: row.operationStatus,
  confirmationStatus: row.confirmationStatus as AssignmentConfirmationStatus,
  attendanceReceivedAt: row.attendanceReceivedAt,
  attendanceCheckoutAt: row.attendanceCheckoutAt,
  punctualityStatus: row.punctualityStatus
    ? (row.punctualityStatus as PunctualityStatus)
    : null,
});

export const employeeWorkdayService = {
  async buildTodayWorkdayMessage(
    companyId: string,
    employeeId: string,
    includeAttendance: boolean,
  ): Promise<string> {
    const at = getBotNow();
    const timeZone = getBotOperationTimezone();
    const workDate = getDateIsoInTimezone(at, timeZone);
    const workdays = await employeeWorkdayAvailabilityRepository.listTodayWorkdaysForEmployee(
      companyId,
      employeeId,
      workDate,
    );
    const assignments = workdays.map(mapTodayWorkdayRow);

    if (assignments.length === 0) {
      return NO_TODAY_ASSIGNMENTS_MESSAGE;
    }

    const lines = ["Tu jornada de hoy:", ""];
    assignments.forEach((assignment, index) => {
      lines.push(...formatTodayAssignmentBlock(assignment, index + 1, timeZone, includeAttendance));
      if (index < assignments.length - 1) {
        lines.push("");
      }
    });

    return lines.join("\n");
  },

  async buildUpcomingAssignmentsMessage(companyId: string, employeeId: string): Promise<string> {
    const at = getBotNow();
    const timeZone = getBotOperationTimezone();
    const assignments = await employeeAssignmentQueryRepository.listUpcomingForEmployee(
      companyId,
      employeeId,
      at,
    );

    if (assignments.length === 0) {
      return NO_UPCOMING_ASSIGNMENTS_MESSAGE;
    }

    const lines = ["Tus próximos trabajos:", ""];
    assignments.forEach((assignment, index) => {
      lines.push(...formatUpcomingAssignmentBlock(assignment, index + 1, timeZone));
      if (index < assignments.length - 1) {
        lines.push("");
      }
    });

    return lines.join("\n");
  },

  async listConfirmableAssignments(
    companyId: string,
    employeeId: string,
  ): Promise<EmployeeAssignedOperation[]> {
    const at = getBotNow();
    const assignments = await employeeAssignmentQueryRepository.listUpcomingForEmployee(
      companyId,
      employeeId,
      at,
    );
    return assignments.filter((assignment) => isFutureAssignment(assignment, at));
  },

  async listUnavailabilityAssignments(
    companyId: string,
    employeeId: string,
  ): Promise<EmployeeAssignedOperation[]> {
    return this.listConfirmableAssignments(companyId, employeeId);
  },

  async getAssignmentForResponseMessage(
    companyId: string,
    employeeId: string,
    operationId: string,
  ): Promise<EmployeeAssignedOperation | null> {
    return employeeAssignmentQueryRepository.findByOperationForEmployee(
      companyId,
      employeeId,
      operationId,
    );
  },

  buildConfirmSelectionPrompt(assignments: EmployeeAssignedOperation[]): string {
    const timeZone = getBotOperationTimezone();
    const lines = [
      "Tenés varios próximos trabajos. Respondé con el número que querés confirmar:",
      "",
      ...assignments.map((assignment, index) =>
        formatUpcomingSelectionLine(assignment, index + 1, timeZone),
      ),
    ];
    return lines.join("\n");
  },

  buildUnavailabilitySelectionPrompt(assignments: EmployeeAssignedOperation[]): string {
    const timeZone = getBotOperationTimezone();
    const lines = [
      "Tenés varios próximos trabajos. Respondé con el número para indicar en cuál no estás disponible:",
      "",
      ...assignments.map((assignment, index) =>
        formatUpcomingSelectionLine(assignment, index + 1, timeZone),
      ),
    ];
    return lines.join("\n");
  },

  buildConfirmedMessage(assignment: EmployeeAssignedOperation): string {
    const timeZone = getBotOperationTimezone();
    return [
      "Confirmamos tu asistencia para:",
      "",
      formatAssignmentServiceReference(assignment),
      formatAssignmentDateTimeLine(assignment, timeZone),
    ].join("\n");
  },

  buildUnavailableMessage(assignment: EmployeeAssignedOperation): string {
    const timeZone = getBotOperationTimezone();
    return [
      "Entendido. Registramos que no estás disponible para:",
      "",
      formatAssignmentServiceReference(assignment),
      formatAssignmentDateTimeLine(assignment, timeZone),
      "",
      "Administración podrá revisar esta respuesta desde el panel.",
    ].join("\n");
  },

  async confirmAssignment(
    companyId: string,
    employeeId: string,
    operationId: string,
  ): Promise<{ kind: "ok" | "not_found" | "past"; message: string }> {
    const assignment = await employeeAssignmentQueryRepository.findByOperationForEmployee(
      companyId,
      employeeId,
      operationId,
    );
    if (!assignment) {
      return { kind: "not_found", message: INVALID_SELECTION_MESSAGE };
    }

    const at = getBotNow();
    if (!isFutureAssignment(assignment, at)) {
      return { kind: "past", message: PAST_ASSIGNMENT_MESSAGE };
    }

    if (assignment.confirmationStatus === "CONFIRMED") {
      return { kind: "ok", message: this.buildConfirmedMessage(assignment) };
    }

    const updated = await employeeAssignmentQueryRepository.updateConfirmationStatus(
      companyId,
      assignment.assignmentId,
      "CONFIRMED",
      [assignment.confirmationStatus],
    );

    if (!updated) {
      // Concurrent transition won; report durable state (no last-write-wins overwrite).
      const latest = await employeeAssignmentQueryRepository.findByOperationForEmployee(
        companyId,
        employeeId,
        operationId,
      );
      if (!latest) {
        return { kind: "not_found", message: INVALID_SELECTION_MESSAGE };
      }
      if (latest.confirmationStatus === "UNAVAILABLE") {
        return { kind: "ok", message: this.buildUnavailableMessage(latest) };
      }
      return { kind: "ok", message: this.buildConfirmedMessage(latest) };
    }

    return { kind: "ok", message: this.buildConfirmedMessage(assignment) };
  },

  async markAssignmentUnavailable(
    companyId: string,
    employeeId: string,
    operationId: string,
  ): Promise<{ kind: "ok" | "not_found" | "past"; message: string }> {
    const assignment = await employeeAssignmentQueryRepository.findByOperationForEmployee(
      companyId,
      employeeId,
      operationId,
    );
    if (!assignment) {
      return { kind: "not_found", message: INVALID_SELECTION_MESSAGE };
    }

    const at = getBotNow();
    if (!isFutureAssignment(assignment, at)) {
      return { kind: "past", message: PAST_ASSIGNMENT_MESSAGE };
    }

    if (assignment.confirmationStatus === "UNAVAILABLE") {
      return { kind: "ok", message: this.buildUnavailableMessage(assignment) };
    }

    const updated = await employeeAssignmentQueryRepository.updateConfirmationStatus(
      companyId,
      assignment.assignmentId,
      "UNAVAILABLE",
      [assignment.confirmationStatus],
    );

    if (!updated) {
      const latest = await employeeAssignmentQueryRepository.findByOperationForEmployee(
        companyId,
        employeeId,
        operationId,
      );
      if (!latest) {
        return { kind: "not_found", message: INVALID_SELECTION_MESSAGE };
      }
      if (latest.confirmationStatus === "CONFIRMED") {
        return { kind: "ok", message: this.buildConfirmedMessage(latest) };
      }
      return { kind: "ok", message: this.buildUnavailableMessage(latest) };
    }

    return { kind: "ok", message: this.buildUnavailableMessage(assignment) };
  },

  mapToSelectionOptions,
  noConfirmableMessage: NO_CONFIRMABLE_ASSIGNMENTS_MESSAGE,
  noUnavailabilityMessage: NO_UNAVAILABILITY_ASSIGNMENTS_MESSAGE,
};
