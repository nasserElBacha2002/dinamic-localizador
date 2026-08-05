import { formatPayrollReceiptPeriod } from "./period-format";

export type PayrollReceiptAvailableTemplateInput = {
  employeeName: string;
  year: number;
  month: number;
};

/**
 * Twilio content variables for PAYROLL_RECEIPT_AVAILABLE template.
 * {"1": employeeName, "2": "MM/YY"}
 */
export const buildPayrollReceiptAvailableTemplateVariables = (
  input: PayrollReceiptAvailableTemplateInput,
): Record<string, string> => ({
  "1": input.employeeName.trim(),
  "2": formatPayrollReceiptPeriod(input.year, input.month),
});
