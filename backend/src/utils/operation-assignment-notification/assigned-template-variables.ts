import { formatLocalTime } from "../attendance-validation";
import { formatServiceReferenceFromFields } from "../format-service-reference";

export type OperationAssignmentAssignedTemplateInput = {
  /** First given name for Twilio {{1}}. */
  employeeFirstName: string;
  serviceName: string;
  serviceAddress?: string | null;
  serviceLocality?: string | null;
  /** ISO datetime of the ONE_TIME operation's scheduled start. */
  scheduledStart: string;
  /** Usually env.BOT_OPERATION_TIMEZONE. */
  timeZone: string;
};

const formatLocalDate = (iso: string, timeZone: string): string =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));

/**
 * Twilio Content variables for EVENTUAL_OPERATION_ASSIGNED (ONE_TIME assignment).
 * Placeholders:
 *   {{1}} employeeFirstName
 *   {{2}} service/operation reference (name ± address ± locality)
 *   {{3}} date DD/MM/YYYY in timeZone (BOT_OPERATION_TIMEZONE)
 *   {{4}} time HH:mm in timeZone
 */
export const buildOperationAssignmentAssignedTemplateVariables = (
  input: OperationAssignmentAssignedTemplateInput,
): Record<string, string> => ({
  "1": input.employeeFirstName,
  "2": formatServiceReferenceFromFields({
    serviceName: input.serviceName,
    serviceAddress: input.serviceAddress,
    serviceLocality: input.serviceLocality,
  }),
  "3": formatLocalDate(input.scheduledStart, input.timeZone),
  "4": formatLocalTime(input.scheduledStart, input.timeZone),
});
