/**
 * Encargado operativo phase 1 — integrity and tenant isolation.
 * Enable: RUN_DB_INTEGRATION_TESTS=true (requires migrations 155–157 applied).
 */
import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { AppError } from "../../errors/app-error";
import {
  describeDatabaseIntegration,
  normalizeSqlDateIso,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../../test-helpers/integration-test";
import { createIntegrationFixtureTracker } from "../../test-helpers/integration-cleanup";
import { createPlatformCompanyFixture } from "../../test-helpers/platform-company-fixture";
import { getPool } from "../../database/connection";
import { hashPassword } from "../../utils/password";
import { userRepository } from "../../repositories/identity/user.repository";
import { userCompanyMembershipRepository } from "../../repositories/companies/user-company-membership.repository";
import { companyUserEmployeeLinkService } from "../companies/company-user-employee-link.service";
import { operationChargeAssignmentService } from "./operation-charge-assignment.service";
import { employeeCategoryRepository } from "../../repositories/employees/employee-category.repository";
import { OPERATIONAL_CHARGE_HOLDER_CATEGORY_NORMALIZED_NAME } from "../../constants/operational-charge-holder";
import { employeeService } from "../employees/employee.service";
import { deleteEmployeeCascade } from "../../test-helpers/integration-entity-cascade";
import { isChargeAssignmentOperationallyEffective } from "../../utils/operations/charge-assignment-effectiveness";
import { operationChargeRevocationService } from "./operation-charge-revocation.service";
import { auditService } from "../audit.service";

const uniquePhone = (suffix: number): string =>
  `+54911${Date.now().toString().slice(-7)}${suffix}`;

const uniqueCompanyName = (): string =>
  `Charge Phase1 ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

describeDatabaseIntegration("operation charge assignment integration", () => {
  const fixtures = createIntegrationFixtureTracker();
  const createdUserIds: string[] = [];

  before(async () => {
    await setupDatabaseIntegration();

    const pool = getPool();
    const tables = await pool.request().query(`
      SELECT OBJECT_ID(N'dbo.operation_charge_assignments', N'U') AS charge_id,
             OBJECT_ID(N'dbo.company_user_employee_links', N'U') AS link_id
    `);
    const row = tables.recordset[0] as { charge_id: unknown; link_id: unknown };
    assert.ok(row?.charge_id, "migration 155 required: operation_charge_assignments");
    assert.ok(row?.link_id, "migration 155 required: company_user_employee_links");

    const employeeIdCol = await pool.request().query(`
      SELECT COL_LENGTH(N'dbo.operation_charge_assignments', N'employee_id') AS col_len
    `);
    assert.ok(
      employeeIdCol.recordset[0]?.col_len,
      "migration 157 required: operation_charge_assignments.employee_id",
    );
  });

  after(async () => {
    const cleanupErrors: unknown[] = [];

    try {
      await fixtures.cleanup();
    } catch (error) {
      cleanupErrors.push(error);
    }

    const pool = getPool();
    for (const userId of createdUserIds) {
      try {
        await pool.request().input("userId", sql.UniqueIdentifier, userId).query(`
          IF OBJECT_ID(N'dbo.operation_charge_assignments', N'U') IS NOT NULL
            DELETE FROM operation_charge_assignments WHERE user_id = @userId;
          IF OBJECT_ID(N'dbo.company_user_employee_links', N'U') IS NOT NULL
            DELETE FROM company_user_employee_links WHERE user_id = @userId;
          DELETE FROM user_company_memberships WHERE user_id = @userId;
          DELETE FROM users WHERE id = @userId;
        `);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    createdUserIds.length = 0;

    try {
      await teardownDatabaseIntegration();
    } catch (error) {
      cleanupErrors.push(error);
    }

    if (cleanupErrors.length > 0) {
      throw new AggregateError(cleanupErrors, "operation charge assignment integration cleanup failed");
    }
  });

  const seedIsolatedTenant = async (): Promise<{ companyId: string; operationId: string }> => {
    const fixture = await createPlatformCompanyFixture({
      name: uniqueCompanyName(),
      defaultTimezone: "America/Argentina/Buenos_Aires",
      owner: {
        name: "Charge Owner",
        email: `owner-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@charge-phase1.test`,
      },
    });
    const companyId = fixture.data.company.id;
    fixtures.trackCompany(companyId);

    const pool = getPool();
    const location = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("name", sql.NVarChar(150), `Charge Loc ${Date.now()}`)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO operational_locations (
          company_id, name, address, locality, latitude, longitude, allowed_radius_meters, active
        )
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, N'Addr', N'CABA', -34.6, -58.4, 150, 1);
        SELECT id FROM @inserted;
      `);
    const serviceId = String(location.recordset[0].id);

    const futureStart = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const operationInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("serviceId", sql.UniqueIdentifier, serviceId)
      .input("scheduledStart", sql.DateTime2, futureStart)
      .query(`
        INSERT INTO scheduled_operations (
          company_id, service_id, scheduled_start, early_tolerance_minutes,
          late_tolerance_minutes, status, operation_kind
        )
        OUTPUT INSERTED.id
        VALUES (@companyId, @serviceId, @scheduledStart, 60, 90, 'SCHEDULED', 'ONE_TIME')
      `);
    const operationId = String(operationInsert.recordset[0].id);
    fixtures.trackOperation(companyId, operationId);

    return { companyId, operationId };
  };

  const createPanelUser = async (companyId: string, role: "SUPERVISOR" | "OPERATOR" = "SUPERVISOR") => {
    const email = `charge-holder-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@integration.test`;
    const passwordHash = await hashPassword("integration-test-password");
    const user = await userRepository.create({
      name: "Charge Holder",
      email,
      passwordHash,
      role: "ADMIN",
    });
    createdUserIds.push(user.id);
    await userCompanyMembershipRepository.create({
      userId: user.id,
      companyId,
      role,
      status: "ACTIVE",
    });
    return user.id;
  };

  const createEmployee = async (companyId: string, label: string) => {
    const pool = getPool();
    const employeeInsert = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("phone", sql.NVarChar(20), uniquePhone(Math.floor(Math.random() * 9)))
      .input("name", sql.NVarChar(200), label)
      .query(`
        DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
        INSERT INTO employees (company_id, name, phone_number, employee_type, active)
        OUTPUT INSERTED.id INTO @inserted (id)
        VALUES (@companyId, @name, @phone, 'fijo', 1);
        SELECT id FROM @inserted;
      `);
    const employeeId = String(employeeInsert.recordset[0].id);
    fixtures.trackEmployee(companyId, employeeId);
    return employeeId;
  };

  const setEmployeeAsEncargado = async (companyId: string, employeeId: string): Promise<void> => {
    const category = await employeeCategoryRepository.findByNormalizedName(
      companyId,
      OPERATIONAL_CHARGE_HOLDER_CATEGORY_NORMALIZED_NAME,
    );
    assert.ok(category?.id, "system Encargado category must exist (migration 054)");
    const pool = getPool();
    await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .input("categoryId", sql.UniqueIdentifier, category.id)
      .query(`
        UPDATE employees
        SET category_id = @categoryId, updated_at = SYSUTCDATETIME()
        WHERE company_id = @companyId AND id = @employeeId
      `);
  };

  const prepareLinkedEncargado = async (
    companyId: string,
    label: string,
  ): Promise<{ userId: string; employeeId: string }> => {
    const userId = await createPanelUser(companyId);
    const employeeId = await createEmployee(companyId, label);
    await setEmployeeAsEncargado(companyId, employeeId);
    await companyUserEmployeeLinkService.createLink(companyId, userId, userId, employeeId);
    return { userId, employeeId };
  };

  it("rejects assign without user-employee link", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const userId = await createPanelUser(companyId);

    await assert.rejects(
      () =>
        operationChargeAssignmentService.assign(companyId, userId, {
          operationId,
          userId,
          validFrom: "2026-05-01",
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "CHARGE_HOLDER_LINK_REQUIRED");
        return true;
      },
    );
  });

  it("rejects user-employee link when collaborator is not Encargado", async () => {
    const { companyId } = await seedIsolatedTenant();
    const userId = await createPanelUser(companyId);
    const employeeId = await createEmployee(companyId, "Operador sin Encargado");

    await assert.rejects(
      () => companyUserEmployeeLinkService.createLink(companyId, userId, userId, employeeId),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "EMPLOYEE_NOT_CHARGE_HOLDER");
        return true;
      },
    );
  });

  it("assigns charge holder with open-ended validity and lists by operation", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId, employeeId } = await prepareLinkedEncargado(companyId, "Encargado panel");
    const validFrom = "2026-06-01";

    const created = await operationChargeAssignmentService.assign(companyId, userId, {
      operationId,
      userId,
      validFrom,
    });
    assert.equal(created.operationId, operationId);
    assert.equal(created.userId, userId);
    assert.equal(created.employeeId, employeeId);
    assert.equal(normalizeSqlDateIso(created.validFrom), validFrom);
    assert.equal(created.validUntil, null);

    const listed = await operationChargeAssignmentService.listByOperation(companyId, operationId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, created.id);
  });

  it("rejects duplicate equivalent period for same user and operation", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId } = await prepareLinkedEncargado(companyId, "Encargado dup");
    const validFrom = "2026-07-01";

    await operationChargeAssignmentService.assign(companyId, userId, {
      operationId,
      userId,
      validFrom,
    });

    await assert.rejects(
      () =>
        operationChargeAssignmentService.assign(companyId, userId, {
          operationId,
          userId,
          validFrom,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "CHARGE_ASSIGNMENT_ALREADY_EXISTS");
        return true;
      },
    );
  });

  it("rejects overlapping periods for same user and operation", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId } = await prepareLinkedEncargado(companyId, "Encargado overlap");

    await operationChargeAssignmentService.assign(companyId, userId, {
      operationId,
      userId,
      validFrom: "2026-08-01",
      validUntil: "2026-08-31",
    });

    await assert.rejects(
      () =>
        operationChargeAssignmentService.assign(companyId, userId, {
          operationId,
          userId,
          validFrom: "2026-08-15",
          validUntil: null,
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "CHARGE_ASSIGNMENT_PERIOD_OVERLAP");
        return true;
      },
    );
  });

  it("serializes concurrent assigns so only one overlapping period wins", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId } = await prepareLinkedEncargado(companyId, "Encargado concurrent");
    const validFrom = "2026-08-20";

    const outcomes = await Promise.allSettled([
      operationChargeAssignmentService.assign(companyId, userId, {
        operationId,
        userId,
        validFrom,
      }),
      operationChargeAssignmentService.assign(companyId, userId, {
        operationId,
        userId,
        validFrom,
      }),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const winner = (fulfilled[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof operationChargeAssignmentService.assign>>>).value;
    assert.equal(normalizeSqlDateIso(winner.validFrom), validFrom);
    assert.equal(winner.operationId, operationId);
    assert.equal(winner.userId, userId);
    assert.equal(winner.cancelledAt, null);

    const failure = rejected[0] as PromiseRejectedResult;
    assert.ok(failure.reason instanceof AppError);
    assert.equal(
      (failure.reason as AppError).code,
      "CHARGE_ASSIGNMENT_ALREADY_EXISTS",
    );

    const listed = await operationChargeAssignmentService.listByOperation(companyId, operationId);
    assert.equal(listed.length, 1);
    assert.equal(listed[0]!.id, winner.id);
    assert.equal(normalizeSqlDateIso(listed[0]!.validFrom), validFrom);
    assert.equal(listed[0]!.cancelledAt, null);

    const pool = getPool();
    const dbCount = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("operationId", sql.UniqueIdentifier, operationId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(`
        SELECT COUNT(*) AS total
        FROM operation_charge_assignments
        WHERE company_id = @companyId
          AND operation_id = @operationId
          AND user_id = @userId
          AND cancelled_at IS NULL
      `);
    assert.equal(Number(dbCount.recordset[0].total), 1);
  });

  it("allows multiple encargados on the same operation", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId: userA } = await prepareLinkedEncargado(companyId, "Encargado A ops");
    const { userId: userB } = await prepareLinkedEncargado(companyId, "Encargado B ops");
    const validFrom = "2026-09-01";

    await operationChargeAssignmentService.assign(companyId, userA, {
      operationId,
      userId: userA,
      validFrom,
    });
    await operationChargeAssignmentService.assign(companyId, userB, {
      operationId,
      userId: userB,
      validFrom,
    });

    const listed = await operationChargeAssignmentService.listByOperation(companyId, operationId);
    assert.equal(listed.length, 2);
  });

  it("isolates tenants: allows own company, rejects foreign company and membership", async () => {
    const tenantA = await seedIsolatedTenant();
    const tenantB = await seedIsolatedTenant();
    const { userId: userA } = await prepareLinkedEncargado(tenantA.companyId, "Encargado tenant A");

    const created = await operationChargeAssignmentService.assign(tenantA.companyId, userA, {
      operationId: tenantA.operationId,
      userId: userA,
      validFrom: "2026-10-01",
    });
    assert.ok(created.id);

    await assert.rejects(
      () =>
        operationChargeAssignmentService.assign(tenantB.companyId, userA, {
          operationId: tenantB.operationId,
          userId: userA,
          validFrom: "2026-10-01",
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "MEMBERSHIP_NOT_FOUND");
        return true;
      },
    );

    await assert.rejects(
      () =>
        operationChargeAssignmentService.assign(tenantB.companyId, userA, {
          operationId: tenantA.operationId,
          userId: userA,
          validFrom: "2026-10-01",
        }),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "OPERATION_NOT_FOUND");
        return true;
      },
    );
  });

  it("ends and cancels assignments and allows non-overlapping follow-up period", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId } = await prepareLinkedEncargado(companyId, "Encargado end/cancel");

    const first = await operationChargeAssignmentService.assign(companyId, userId, {
      operationId,
      userId,
      validFrom: "2026-11-01",
      validUntil: "2026-11-30",
    });

    const ended = await operationChargeAssignmentService.endAssignment(
      companyId,
      userId,
      first.id,
      "2026-11-20",
    );
    assert.equal(normalizeSqlDateIso(ended.validUntil), "2026-11-20");

    const second = await operationChargeAssignmentService.assign(companyId, userId, {
      operationId,
      userId,
      validFrom: "2026-12-01",
    });
    assert.ok(second.id);

    const cancelled = await operationChargeAssignmentService.cancelAssignment(
      companyId,
      userId,
      second.id,
    );
    assert.ok(cancelled.cancelledAt);
  });

  it("manages user-employee links: create, explicit replace, remove", async () => {
    const { companyId } = await seedIsolatedTenant();
    const userA = await createPanelUser(companyId);
    const userB = await createPanelUser(companyId);
    const employeeA = await createEmployee(companyId, "Encargado A");
    const employeeB = await createEmployee(companyId, "Encargado B");
    await setEmployeeAsEncargado(companyId, employeeA);
    await setEmployeeAsEncargado(companyId, employeeB);

    const linkA = await companyUserEmployeeLinkService.createLink(companyId, userA, userA, employeeA);
    assert.equal(linkA.employeeId, employeeA);

    await assert.rejects(
      () => companyUserEmployeeLinkService.createLink(companyId, userB, userB, employeeA),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "EMPLOYEE_ALREADY_LINKED");
        return true;
      },
    );

    await assert.rejects(
      () => companyUserEmployeeLinkService.createLink(companyId, userA, userA, employeeB),
      (error: unknown) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, "USER_EMPLOYEE_LINK_EXISTS");
        return true;
      },
    );

    const replaced = await companyUserEmployeeLinkService.replaceLink(
      companyId,
      userA,
      userA,
      employeeB,
    );
    assert.equal(replaced.employeeId, employeeB);
    assert.equal(replaced.previousEmployeeId, employeeA);
    assert.ok(replaced.lastReplacedAt);
    assert.equal(replaced.lastReplacedByUserId, userA);

    await companyUserEmployeeLinkService.removeLink(companyId, userA, userA);
    const missing = await companyUserEmployeeLinkService.getByUserId(companyId, userA);
    assert.equal(missing, null);
  });

  it("revokes effective charge assignments when collaborator loses Encargado category", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId, employeeId } = await prepareLinkedEncargado(companyId, "Encargado categoría");

    const assignment = await operationChargeAssignmentService.assign(companyId, userId, {
      operationId,
      userId,
      validFrom: "2026-06-01",
    });
    assert.ok(!assignment.cancelledAt);

    await employeeService.update(companyId, employeeId, { categoryId: null }, userId);

    const after = await operationChargeAssignmentService.listByUser(companyId, userId);
    assert.equal(after.length, 1);
    assert.equal(after[0]!.id, assignment.id);
    assert.ok(after[0]!.cancelledAt);
    assert.equal(isChargeAssignmentOperationallyEffective(after[0]!, "2026-06-15"), false);

    const pool = getPool();
    const auditRows = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignment.id)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT action, entity_type, entity_id
        FROM audit_logs
        WHERE company_id = @companyId
          AND (
            (entity_type = N'operation_charge_assignment' AND entity_id = @assignmentId AND action = N'CHARGE_ASSIGNMENT_REVOKED')
            OR (entity_type = N'employee' AND entity_id = @employeeId AND action = N'operational_charge_revoked')
          )
      `);
    assert.equal(auditRows.recordset.length, 2);
  });

  it("replaceLink cancels effective assignments but preserves ended historical rows", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId: userA } = await prepareLinkedEncargado(companyId, "Encargado replace A");
    const employeeB = await createEmployee(companyId, "Encargado replace B");
    await setEmployeeAsEncargado(companyId, employeeB);

    const active = await operationChargeAssignmentService.assign(companyId, userA, {
      operationId,
      userId: userA,
      validFrom: "2026-07-01",
    });
    const ended = await operationChargeAssignmentService.assign(companyId, userA, {
      operationId,
      userId: userA,
      validFrom: "2025-01-01",
      validUntil: "2025-12-31",
    });

    await companyUserEmployeeLinkService.replaceLink(companyId, userA, userA, employeeB);

    const rows = await operationChargeAssignmentService.listByUser(companyId, userA);
    const activeRow = rows.find((row) => row.id === active.id);
    const endedRow = rows.find((row) => row.id === ended.id);
    assert.ok(activeRow?.cancelledAt);
    assert.equal(endedRow?.cancelledAt ?? null, null);
    assert.equal(isChargeAssignmentOperationallyEffective(endedRow!, "2026-06-01"), false);

    const reassigned = await operationChargeAssignmentService.assign(companyId, userA, {
      operationId,
      userId: userA,
      validFrom: "2026-08-01",
    });
    assert.equal(reassigned.employeeId, employeeB);
  });

  it("deleteEmployeeCascade removes charge rows referencing the collaborator (purge)", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId, employeeId } = await prepareLinkedEncargado(companyId, "Encargado purge");
    await operationChargeAssignmentService.assign(companyId, userId, {
      operationId,
      userId,
      validFrom: "2026-09-01",
    });

    await deleteEmployeeCascade(companyId, employeeId);

    const pool = getPool();
    const chargeCount = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("employeeId", sql.UniqueIdentifier, employeeId)
      .query(`
        SELECT COUNT(*) AS total
        FROM operation_charge_assignments
        WHERE company_id = @companyId AND employee_id = @employeeId
      `);
    assert.equal(Number(chargeCount.recordset[0].total), 0);
  });

  it("serializes replaceLink with concurrent assign (one wins, no incompatible active row)", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId } = await prepareLinkedEncargado(companyId, "Encargado race A");
    const employeeB = await createEmployee(companyId, "Encargado race B");
    await setEmployeeAsEncargado(companyId, employeeB);

    await operationChargeAssignmentService.assign(companyId, userId, {
      operationId,
      userId,
      validFrom: "2026-10-01",
    });

    const outcomes = await Promise.allSettled([
      companyUserEmployeeLinkService.replaceLink(companyId, userId, userId, employeeB),
      operationChargeAssignmentService.assign(companyId, userId, {
        operationId,
        userId,
        validFrom: "2026-10-15",
      }),
    ]);

    assert.ok(outcomes.some((entry) => entry.status === "fulfilled"));
    const replaced = outcomes[0]?.status === "fulfilled";
    const assigned = outcomes[1]?.status === "fulfilled";

    const link = await companyUserEmployeeLinkService.getByUserId(companyId, userId);
    assert.ok(link);
    if (replaced) {
      assert.equal(link!.employeeId, employeeB);
    }

    const rows = await operationChargeAssignmentService.listByUser(companyId, userId);
    const effectiveRows = rows.filter((row) =>
      isChargeAssignmentOperationallyEffective(row, "2026-10-20"),
    );
    const nonCancelledEffective = effectiveRows.filter((row) => !row.cancelledAt);
    assert.ok(nonCancelledEffective.length <= 1);

    if (assigned && !replaced) {
      const followUp = nonCancelledEffective.find(
        (row) => normalizeSqlDateIso(row.validFrom) === "2026-10-15",
      );
      assert.ok(followUp);
      assert.equal(followUp!.employeeId, link!.employeeId);
    }

    if (replaced) {
      const preReplaceOp = rows.find(
        (row) =>
          normalizeSqlDateIso(row.validFrom) === "2026-10-01" &&
          row.operationId === operationId,
      );
      assert.ok(preReplaceOp?.cancelledAt, "pre-replace assignment must be cancelled");
    }
  });

  it("serializes concurrent cancel so the assignment is cancelled exactly once", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId } = await prepareLinkedEncargado(companyId, "Encargado concurrent cancel");

    const created = await operationChargeAssignmentService.assign(companyId, userId, {
      operationId,
      userId,
      validFrom: "2026-11-05",
    });

    const outcomes = await Promise.allSettled([
      operationChargeAssignmentService.cancelAssignment(companyId, userId, created.id),
      operationChargeAssignmentService.cancelAssignment(companyId, userId, created.id),
    ]);

    const fulfilled = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const rejected = outcomes.filter((outcome) => outcome.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);

    const rows = await operationChargeAssignmentService.listByOperation(companyId, operationId);
    const target = rows.find((row) => row.id === created.id);
    assert.ok(target?.cancelledAt);
    assert.equal(rows.filter((row) => row.id === created.id && row.cancelledAt).length, 1);
  });

  it("rolls back revocation and audit rows when the transaction aborts after category-side effects", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId, employeeId } = await prepareLinkedEncargado(companyId, "Encargado rollback audit");
    const assignment = await operationChargeAssignmentService.assign(companyId, userId, {
      operationId,
      userId,
      validFrom: "2026-06-01",
    });

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      const revokedIds = await operationChargeRevocationService.revokeForEmployeeCollaboratorInTransaction(
        companyId,
        transaction,
        {
          employeeId,
          actorUserId: userId,
          reason: "EMPLOYEE_CATEGORY_CHANGED",
        },
      );
      assert.ok(revokedIds.includes(assignment.id));
      await auditService.log(
        companyId,
        {
          entityType: "employee",
          entityId: employeeId,
          action: "operational_charge_revoked",
          newData: { reason: "EMPLOYEE_CATEGORY_CHANGED", revokedAssignmentIds: revokedIds },
          userId,
        },
        transaction,
      );
      throw new Error("injected_post_audit_failure");
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "injected_post_audit_failure") {
        throw error;
      }
      await transaction.rollback();
    }

    const after = await operationChargeAssignmentService.listByUser(companyId, userId);
    const row = after.find((entry) => entry.id === assignment.id);
    assert.equal(row?.cancelledAt ?? null, null);

    const auditRows = await pool
      .request()
      .input("companyId", sql.UniqueIdentifier, companyId)
      .input("assignmentId", sql.UniqueIdentifier, assignment.id)
      .query(`
        SELECT COUNT(*) AS total
        FROM audit_logs
        WHERE company_id = @companyId
          AND entity_type = N'operation_charge_assignment'
          AND entity_id = @assignmentId
          AND action = N'CHARGE_ASSIGNMENT_REVOKED'
      `);
    assert.equal(Number(auditRows.recordset[0].total), 0);
  });

  it("rolls back link replacement revocations when the transaction aborts", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId } = await prepareLinkedEncargado(companyId, "Encargado rollback replace");
    const employeeB = await createEmployee(companyId, "Encargado rollback B");
    await setEmployeeAsEncargado(companyId, employeeB);

    const assignment = await operationChargeAssignmentService.assign(companyId, userId, {
      operationId,
      userId,
      validFrom: "2026-08-01",
    });

    const pool = getPool();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
      await operationChargeRevocationService.revokeEffectiveForUserInTransaction(companyId, transaction, {
        userId,
        actorUserId: userId,
        reason: "USER_EMPLOYEE_LINK_REPLACED",
      });
      throw new Error("injected_replace_tail_failure");
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "injected_replace_tail_failure") {
        throw error;
      }
      await transaction.rollback();
    }

    const row = (await operationChargeAssignmentService.listByUser(companyId, userId)).find(
      (entry) => entry.id === assignment.id,
    );
    assert.equal(row?.cancelledAt ?? null, null);
    const link = await companyUserEmployeeLinkService.getByUserId(companyId, userId);
    assert.notEqual(link?.employeeId, employeeB);
  });

  it("does not leave effective assignments when assign races category removal", async () => {
    const { companyId, operationId } = await seedIsolatedTenant();
    const { userId, employeeId } = await prepareLinkedEncargado(companyId, "Encargado race category");
    const validFrom = "2027-02-01";

    const outcomes = await Promise.allSettled([
      employeeService.update(companyId, employeeId, { categoryId: null }, userId),
      operationChargeAssignmentService.assign(companyId, userId, {
        operationId,
        userId,
        validFrom,
      }),
    ]);

    const rows = await operationChargeAssignmentService.listByUser(companyId, userId);
    const effective = rows.filter(
      (row) =>
        !row.cancelledAt &&
        isChargeAssignmentOperationallyEffective(row, validFrom) &&
        normalizeSqlDateIso(row.validFrom) === validFrom,
    );
    assert.equal(effective.length, 0);

    const raceRow = rows.find((row) => normalizeSqlDateIso(row.validFrom) === validFrom);
    if (raceRow) {
      assert.ok(
        raceRow.cancelledAt ||
          !isChargeAssignmentOperationallyEffective(raceRow, validFrom),
        "rows created during the race must not stay operationally effective without Encargado",
      );
    }

    const assignOutcome = outcomes[1];
    if (assignOutcome?.status === "rejected") {
      const reason = (assignOutcome as PromiseRejectedResult).reason;
      assert.ok(reason instanceof AppError);
      assert.ok(
        reason.code === "EMPLOYEE_NOT_CHARGE_HOLDER" ||
          reason.code === "CHARGE_ASSIGNMENT_LOCK_TIMEOUT" ||
          reason.code === "CHARGE_HOLDER_LINK_REQUIRED",
      );
    }
  });

  it("migration 157 rollback marker is absent when employee_id originates from 155", async () => {
    const pool = getPool();
    const marker = await pool.request().query(`
      SELECT COUNT(*) AS total
      FROM sys.extended_properties ep
      INNER JOIN sys.columns c ON ep.major_id = c.object_id AND ep.minor_id = c.column_id
      INNER JOIN sys.tables t ON c.object_id = t.object_id
      WHERE ep.name = N'migration_157_added_employee_id_column'
        AND t.name = N'operation_charge_assignments'
        AND SCHEMA_NAME(t.schema_id) = N'dbo'
        AND c.name = N'employee_id'
    `);
    assert.equal(Number(marker.recordset[0].total), 0);
  });
});
