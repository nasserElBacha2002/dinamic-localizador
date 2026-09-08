import { COMPANY_MODULE_KEYS } from "../constants/company-modules";
import { botSessionRepository } from "../repositories/bot-session.repository";
import { companyModuleRepository } from "../repositories/company-module.repository";
import { companyRepository } from "../repositories/company.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { isPayrollReceiptSessionState } from "../utils/bot-session-states";
import { normalizePhoneNumber } from "../utils/phone";

export const payrollReceiptQueryAuthorizationService = {
  async isAuthorized(input: {
    companyId: string;
    employeeId: string;
    botSessionId: string;
    phoneNumber: string;
  }): Promise<boolean> {
    const [company, employee, session, payrollEnabled] = await Promise.all([
      companyRepository.findById(input.companyId),
      employeeRepository.findById(input.companyId, input.employeeId),
      botSessionRepository.findValidActiveById(input.companyId, input.botSessionId),
      companyModuleRepository.isEnabled(
        input.companyId,
        COMPANY_MODULE_KEYS.PAYROLL_RECEIPTS,
      ),
    ]);

    if (
      company?.status !== "ACTIVE" ||
      !employee?.active ||
      !session ||
      !isPayrollReceiptSessionState(session.state) ||
      session.employeeId !== input.employeeId ||
      !payrollEnabled
    ) {
      return false;
    }

    try {
      const inboundPhone = normalizePhoneNumber(input.phoneNumber);
      return (
        normalizePhoneNumber(employee.phoneNumber) === inboundPhone &&
        normalizePhoneNumber(session.phoneNumber) === inboundPhone
      );
    } catch {
      return false;
    }
  },
};
