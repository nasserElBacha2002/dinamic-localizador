import { INVALID_SELECTION_MESSAGE } from "./bot/bot-response.builder";
import { employeeAssignmentQueryRepository } from "../repositories/employee-assignment-query.repository";
import type { EmployeeAssignedInventory } from "../types/employee-assignment-query";
import type { InventorySelectionOption } from "../types/twilio.types";
import { getBotNow } from "../utils/bot-runtime-context";
import { getBotOperationTimezone } from "../utils/bot-runtime-settings-scope";
import {
  formatAssignmentDateTimeLine,
  formatTodayAssignmentBlock,
  formatUpcomingAssignmentBlock,
  formatUpcomingSelectionLine,
  NO_CONFIRMABLE_ASSIGNMENTS_MESSAGE,
  NO_TODAY_ASSIGNMENTS_MESSAGE,
  NO_UNAVAILABILITY_ASSIGNMENTS_MESSAGE,
  NO_UPCOMING_ASSIGNMENTS_MESSAGE,
  PAST_ASSIGNMENT_MESSAGE,
} from "../utils/employee-assignment-format";

const isFutureAssignment = (assignment: EmployeeAssignedInventory, at: Date): boolean =>
  new Date(assignment.scheduledStart).getTime() > at.getTime();

const mapToSelectionOptions = (
  assignments: EmployeeAssignedInventory[],
): InventorySelectionOption[] =>
  assignments.map((assignment) => ({
    inventoryId: assignment.inventoryId,
    storeName: assignment.storeName,
    scheduledStart: assignment.scheduledStart,
  }));

export const employeeWorkdayService = {
  async buildTodayWorkdayMessage(
    companyId: string,
    employeeId: string,
    includeAttendance: boolean,
  ): Promise<string> {
    const at = getBotNow();
    const timeZone = getBotOperationTimezone();
    const assignments = await employeeAssignmentQueryRepository.listTodayForEmployee(
      companyId,
      employeeId,
      at,
      timeZone,
    );

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

    const lines = ["Tus próximos inventarios:", ""];
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
  ): Promise<EmployeeAssignedInventory[]> {
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
  ): Promise<EmployeeAssignedInventory[]> {
    return this.listConfirmableAssignments(companyId, employeeId);
  },

  async getAssignmentForResponseMessage(
    companyId: string,
    employeeId: string,
    inventoryId: string,
  ): Promise<EmployeeAssignedInventory | null> {
    return employeeAssignmentQueryRepository.findByInventoryForEmployee(
      companyId,
      employeeId,
      inventoryId,
    );
  },

  buildConfirmSelectionPrompt(assignments: EmployeeAssignedInventory[]): string {
    const timeZone = getBotOperationTimezone();
    const lines = [
      "Tenés varios próximos inventarios. Respondé con el número que querés confirmar:",
      "",
      ...assignments.map((assignment, index) =>
        formatUpcomingSelectionLine(assignment, index + 1, timeZone),
      ),
    ];
    return lines.join("\n");
  },

  buildUnavailabilitySelectionPrompt(assignments: EmployeeAssignedInventory[]): string {
    const timeZone = getBotOperationTimezone();
    const lines = [
      "Tenés varios próximos inventarios. Respondé con el número para indicar en cuál no estás disponible:",
      "",
      ...assignments.map((assignment, index) =>
        formatUpcomingSelectionLine(assignment, index + 1, timeZone),
      ),
    ];
    return lines.join("\n");
  },

  buildConfirmedMessage(assignment: EmployeeAssignedInventory): string {
    const timeZone = getBotOperationTimezone();
    return [
      "Listo, confirmamos tu asistencia para:",
      "",
      assignment.storeName,
      formatAssignmentDateTimeLine(assignment, timeZone),
    ].join("\n");
  },

  buildUnavailableMessage(assignment: EmployeeAssignedInventory): string {
    const timeZone = getBotOperationTimezone();
    return [
      "Entendido. Registramos que no estás disponible para:",
      "",
      assignment.storeName,
      formatAssignmentDateTimeLine(assignment, timeZone),
      "",
      "Administración podrá revisar esta respuesta desde el panel.",
    ].join("\n");
  },

  async confirmAssignment(
    companyId: string,
    employeeId: string,
    inventoryId: string,
  ): Promise<{ kind: "ok" | "not_found" | "past"; message: string }> {
    const assignment = await employeeAssignmentQueryRepository.findByInventoryForEmployee(
      companyId,
      employeeId,
      inventoryId,
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

    await employeeAssignmentQueryRepository.updateConfirmationStatus(
      companyId,
      employeeId,
      inventoryId,
      "CONFIRMED",
    );

    return { kind: "ok", message: this.buildConfirmedMessage(assignment) };
  },

  async markAssignmentUnavailable(
    companyId: string,
    employeeId: string,
    inventoryId: string,
  ): Promise<{ kind: "ok" | "not_found" | "past"; message: string }> {
    const assignment = await employeeAssignmentQueryRepository.findByInventoryForEmployee(
      companyId,
      employeeId,
      inventoryId,
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

    await employeeAssignmentQueryRepository.updateConfirmationStatus(
      companyId,
      employeeId,
      inventoryId,
      "UNAVAILABLE",
    );

    return { kind: "ok", message: this.buildUnavailableMessage(assignment) };
  },

  mapToSelectionOptions,
  noConfirmableMessage: NO_CONFIRMABLE_ASSIGNMENTS_MESSAGE,
  noUnavailabilityMessage: NO_UNAVAILABILITY_ASSIGNMENTS_MESSAGE,
};
