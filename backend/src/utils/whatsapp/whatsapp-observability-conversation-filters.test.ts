import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildWhatsappConversationListFilters } from "./whatsapp-observability-conversation-filters";

describe("buildWhatsappConversationListFilters", () => {
  it("pairs employeeId clause with a binding", () => {
    const parts = buildWhatsappConversationListFilters({
      employeeId: "2305D868-AF39-4154-8B75-0C854A799DF5",
    });
    assert.equal(parts.length, 1);
    assert.equal(parts[0]?.clause, "c.employee_id = @employeeId");
    assert.equal(typeof parts[0]?.apply, "function");
  });

  it("filters by status, flow, result, activity range, and error flags", () => {
    const withErrors = buildWhatsappConversationListFilters({
      status: "ACTIVE",
      flowType: "INBOUND_LOCATION",
      resultCode: "CHECKIN_COMPLETED",
      from: "2026-08-01T03:00:00.000Z",
      to: "2026-08-08T02:59:00.000Z",
      hasError: true,
    });
    const clauses = withErrors.map((part) => part.clause);
    assert.ok(clauses.includes("c.status = @status"));
    assert.ok(clauses.includes("c.last_flow_type = @flowType"));
    assert.ok(clauses.includes("c.last_result_code = @resultCode"));
    assert.ok(clauses.includes("c.last_activity_at >= @fromAt"));
    assert.ok(clauses.includes("c.last_activity_at <= @toAt"));
    assert.ok(clauses.includes("c.error_count > 0"));

    const withoutErrors = buildWhatsappConversationListFilters({ hasError: false });
    assert.ok(withoutErrors.some((part) => part.clause === "c.error_count = 0"));
  });

  it("combines company and employee filters without dropping either", () => {
    const parts = buildWhatsappConversationListFilters({
      companyId: "11111111-1111-4111-8111-111111111111",
      employeeId: "22222222-2222-4222-8222-222222222222",
      status: "COMPLETED",
    });
    const clauses = parts.map((part) => part.clause);
    assert.ok(clauses.includes("c.company_id = @companyId"));
    assert.ok(clauses.includes("c.employee_id = @employeeId"));
    assert.ok(clauses.includes("c.status = @status"));
    assert.equal(clauses.join(" AND ").includes(" OR "), false);
  });

  it("does not emit phone or search predicates", () => {
    const parts = buildWhatsappConversationListFilters({
      employeeId: "2305D868-AF39-4154-8B75-0C854A799DF5",
    });
    const sqlText = parts.map((part) => part.clause).join(" ");
    assert.equal(sqlText.includes("phone"), false);
    assert.equal(sqlText.includes("search"), false);
  });
});
