/**
 * Formats a payroll period as MM/YY for WhatsApp template / user-facing copy.
 */
export const formatPayrollReceiptPeriod = (year: number, month: number): string => {
  const mm = String(month).padStart(2, "0");
  const yy = String(year % 100).padStart(2, "0");
  return `${mm}/${yy}`;
};
