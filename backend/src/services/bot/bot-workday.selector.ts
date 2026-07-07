import type {
  EmployeeWorkdayCheckInCandidate,
  EmployeeWorkdayCheckoutCandidate,
  WorkdaySelectionOption,
} from "../../types/employee-workday-availability";
import { employeeWorkdayAvailabilityService } from "../employee-workday-availability.service";
import { parseOperationSelection } from "../../utils/intent";

export const parseWorkdaySelectionIndex = (body: string): number | null =>
  parseOperationSelection(body);

export const isValidWorkdaySelection = (
  selection: number | null,
  optionsLength: number,
): selection is number =>
  selection !== null && selection > 0 && selection <= optionsLength;

export const findCheckInCandidateByWorkdayId = async (
  companyId: string,
  employeeId: string,
  employeeWorkdayId: string,
  at: Date,
): Promise<EmployeeWorkdayCheckInCandidate | null> =>
  employeeWorkdayAvailabilityService.revalidateCheckInCandidate(
    companyId,
    employeeId,
    employeeWorkdayId,
    at,
  );

export const findCheckoutCandidateByAttendanceId = async (
  companyId: string,
  employeeId: string,
  attendanceRecordId: string,
): Promise<EmployeeWorkdayCheckoutCandidate | null> =>
  employeeWorkdayAvailabilityService.revalidateCheckoutCandidate(
    companyId,
    employeeId,
    attendanceRecordId,
  );

export const listAvailableCheckInWorkdays = async (
  companyId: string,
  employeeId: string,
  at: Date,
): Promise<{
  candidates: EmployeeWorkdayCheckInCandidate[];
  hasJustifiedWorkdayInWindow: boolean;
}> => employeeWorkdayAvailabilityService.listAvailableForCheckIn(companyId, employeeId, at);

export const listOpenCheckoutWorkdays = async (
  companyId: string,
  employeeId: string,
): Promise<EmployeeWorkdayCheckoutCandidate[]> =>
  employeeWorkdayAvailabilityService.listOpenForCheckout(companyId, employeeId);

export const mapCheckInCandidatesToSessionOptions = (
  candidates: EmployeeWorkdayCheckInCandidate[],
): WorkdaySelectionOption[] =>
  employeeWorkdayAvailabilityService.mapCheckInCandidatesToSelectionOptions(candidates);

export const mapCheckoutCandidatesToSessionOptions = (
  candidates: EmployeeWorkdayCheckoutCandidate[],
): WorkdaySelectionOption[] =>
  employeeWorkdayAvailabilityService.mapCheckoutCandidatesToSelectionOptions(candidates);

export const resolveWorkdayOptionFromSession = (
  options: WorkdaySelectionOption[],
  selection: number,
): WorkdaySelectionOption | null => options[selection - 1] ?? null;
