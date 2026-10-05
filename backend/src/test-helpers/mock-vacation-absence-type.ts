import { mock } from "node:test";

/** Mock-driven WhatsApp tests have no DB pool; absence kind filtering must not call SQL. */
export const mockActiveVacationAbsenceType = async (): Promise<void> => {
  const { absenceTypeRepository } = await import("../repositories/absence-type.repository");
  mock.method(absenceTypeRepository, "findByCode", async (_companyId: string, code: string) =>
    code === "VACATION"
      ? {
          id: "00000000-0000-4000-8000-000000000099",
          code: "VACATION",
          isActive: true,
        }
      : null,
  );
};
