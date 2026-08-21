import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EMPTY_DATE_RANGE_VALUE, resolveDateRangePreset } from "../../../utils/date-range";
import {
  buildWhatsappConversationListFilters,
  toObservabilityActivityBounds,
  WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS,
} from "./whatsapp-observability-list-table-state";

describe("buildWhatsappConversationListFilters", () => {
  it("omits empty filter values", () => {
    const filters = buildWhatsappConversationListFilters({
      state: WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS,
      dateRange: EMPTY_DATE_RANGE_VALUE,
    });

    assert.equal(filters.page, 1);
    assert.equal(filters.limit, 20);
    assert.equal(filters.employeeId, undefined);
    assert.equal(filters.flowType, undefined);
    assert.equal(filters.resultCode, undefined);
    assert.equal(filters.status, undefined);
    assert.equal(filters.hasError, undefined);
    assert.equal(filters.from, undefined);
    assert.equal(filters.to, undefined);
    assert.equal("search" in filters, false);
    assert.equal("phone" in filters, false);
  });

  it("maps collaborator and combined filters explicitly", () => {
    const dateRange = resolveDateRangePreset("last_7_days");
    const filters = buildWhatsappConversationListFilters({
      state: {
        ...WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS,
        page: 3,
        employeeId: "2305D868-AF39-4154-8B75-0C854A799DF5",
        status: "ACTIVE",
        hasError: "false",
        flowType: "  ",
        resultCode: "CHECKIN_COMPLETED",
      },
      dateRange,
      flowType: "INBOUND_LOCATION",
      resultCode: "  CHECKIN_COMPLETED  ",
    });

    assert.equal(filters.page, 3);
    assert.equal(filters.employeeId, "2305D868-AF39-4154-8B75-0C854A799DF5");
    assert.equal(filters.status, "ACTIVE");
    assert.equal(filters.hasError, false);
    assert.equal(filters.flowType, "INBOUND_LOCATION");
    assert.equal(filters.resultCode, "CHECKIN_COMPLETED");
    assert.ok(filters.from);
    assert.ok(filters.to);
    assert.match(filters.from!, /T/);
    assert.match(filters.to!, /T/);
  });

  it("maps hasError true for conversations with errors", () => {
    const filters = buildWhatsappConversationListFilters({
      state: {
        ...WHATSAPP_OBSERVABILITY_TABLE_DEFAULTS,
        hasError: "true",
      },
      dateRange: EMPTY_DATE_RANGE_VALUE,
    });
    assert.equal(filters.hasError, true);
  });

  it("converts activity calendar days to ISO datetimes", () => {
    const bounds = toObservabilityActivityBounds(resolveDateRangePreset("today"));
    assert.ok(bounds.from);
    assert.ok(bounds.to);
    assert.match(bounds.from!, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(bounds.to!, /^\d{4}-\d{2}-\d{2}T/);
  });

  it("maps Hoy and Últimos 7 días to the same calendar days as the selector", () => {
    const today = resolveDateRangePreset("today", "2026-08-20");
    assert.equal(today.from, "2026-08-20");
    assert.equal(today.to, "2026-08-20");
    const todayBounds = toObservabilityActivityBounds(today);
    assert.equal(todayBounds.from, "2026-08-20T03:00:00.000Z");
    assert.equal(todayBounds.to, "2026-08-21T02:59:00.000Z");

    const last7 = resolveDateRangePreset("last_7_days", "2026-08-20");
    assert.equal(last7.from, "2026-08-14");
    assert.equal(last7.to, "2026-08-20");
    const last7Bounds = toObservabilityActivityBounds(last7);
    assert.equal(last7Bounds.from, "2026-08-14T03:00:00.000Z");
    assert.equal(last7Bounds.to, "2026-08-21T02:59:00.000Z");
  });

  it("hydrates preset-only date ranges before converting to ISO", () => {
    const bounds = toObservabilityActivityBounds({
      preset: "last_7_days",
      from: null,
      to: null,
    });
    assert.ok(bounds.from);
    assert.ok(bounds.to);
    assert.match(bounds.from!, /T/);
    assert.match(bounds.to!, /T/);
  });
});
