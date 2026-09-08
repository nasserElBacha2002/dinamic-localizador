import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { botSessionRepository } from "../repositories/bot-session.repository";
import { companyModuleRepository } from "../repositories/company-module.repository";
import { companyRepository } from "../repositories/company.repository";
import { employeeRepository } from "../repositories/employee.repository";
import { payrollReceiptQueryAuthorizationService } from "./payroll-receipt-query-authorization.service";

const COMPANY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPLOYEE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SESSION_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PHONE = "+5491100000000";

const arrange = (overrides?: {
  companyStatus?: string;
  employeeActive?: boolean;
  employeePhone?: string;
  sessionPhone?: string;
  sessionEmployeeId?: string;
  sessionState?: string;
  payrollEnabled?: boolean;
}) => {
  mock.method(companyRepository, "findById", async () => ({
    status: overrides?.companyStatus ?? "ACTIVE",
  }) as never);
  mock.method(employeeRepository, "findById", async () => ({
    active: overrides?.employeeActive ?? true,
    phoneNumber: overrides?.employeePhone ?? PHONE,
  }) as never);
  mock.method(botSessionRepository, "findValidActiveById", async () => ({
    state: overrides?.sessionState ?? "WAITING_PAYROLL_RECEIPT_PERIOD",
    employeeId: overrides?.sessionEmployeeId ?? EMPLOYEE_ID,
    phoneNumber: overrides?.sessionPhone ?? PHONE,
  }) as never);
  mock.method(
    companyModuleRepository,
    "isEnabled",
    async () => overrides?.payrollEnabled ?? true,
  );
};

describe("payrollReceiptQueryAuthorizationService", () => {
  afterEach(() => {
    mock.restoreAll();
  });

  it("authorizes only the active tenant employee bound to the current phone and session", async () => {
    arrange();
    assert.equal(
      await payrollReceiptQueryAuthorizationService.isAuthorized({
        companyId: COMPANY_ID,
        employeeId: EMPLOYEE_ID,
        botSessionId: SESSION_ID,
        phoneNumber: PHONE,
      }),
      true,
    );
  });

  for (const testCase of [
    { name: "inactive company", overrides: { companyStatus: "SUSPENDED" } },
    { name: "inactive employee", overrides: { employeeActive: false } },
    { name: "reassigned employee phone", overrides: { employeePhone: "+5491100000001" } },
    { name: "session from another employee", overrides: { sessionEmployeeId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" } },
    { name: "session bound to another phone", overrides: { sessionPhone: "+5491100000001" } },
    { name: "disabled payroll module", overrides: { payrollEnabled: false } },
  ]) {
    it(`rejects ${testCase.name}`, async () => {
      arrange(testCase.overrides);
      assert.equal(
        await payrollReceiptQueryAuthorizationService.isAuthorized({
          companyId: COMPANY_ID,
          employeeId: EMPLOYEE_ID,
          botSessionId: SESSION_ID,
          phoneNumber: PHONE,
        }),
        false,
      );
    });
  }
});
