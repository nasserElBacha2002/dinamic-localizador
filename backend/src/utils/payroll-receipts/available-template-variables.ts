import { formatPayrollReceiptPeriod } from "./period-format";

export type PayrollReceiptAvailableTemplateInput = {
  year: number;
  month: number;
};

/**
 * Twilio Content variables for aviso_recibo (single body variable).
 * Contract: { "1": "MM/YY" } — never employee name.
 */
export const buildPayrollReceiptAvailableTemplateVariables = (
  input: PayrollReceiptAvailableTemplateInput,
): Record<string, string> => ({
  "1": formatPayrollReceiptPeriod(input.year, input.month),
});
