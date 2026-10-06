import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDateRangeListHref,
  buildHomeStatisticsFilters,
  buildHomeStatisticsPageHref,
  buildHomeTodayOperationsFilters,
  resolveHomeTodayIsoRange,
} from "./home-dashboard";

const REFERENCE_DATE = "2026-08-20";

describe("home dashboard helpers", () => {
  it("resolves today ISO range from operation default preset", () => {
    const resolved = resolveHomeTodayIsoRange(REFERENCE_DATE);
    assert.ok(resolved);
    assert.equal(resolved.dateRange.preset, "today");
    assert.equal(resolved.dateRange.from, "2026-08-20");
    assert.equal(resolved.dateRange.to, "2026-08-20");
    assert.match(resolved.isoDateFrom, /2026-08-20/);
    assert.ok(resolved.isoDateTo.length > 0);
  });

  it("builds statistics and operations filters for today", () => {
    const resolved = resolveHomeTodayIsoRange(REFERENCE_DATE);
    assert.ok(resolved);

    const statsFilters = buildHomeStatisticsFilters(resolved.isoDateFrom, resolved.isoDateTo);
    assert.equal(statsFilters.dateFrom, resolved.isoDateFrom);
    assert.equal(statsFilters.dateTo, resolved.isoDateTo);

    const operationFilters = buildHomeTodayOperationsFilters(
      resolved.isoDateFrom,
      resolved.isoDateTo,
    );
    assert.equal(operationFilters.dateFrom, resolved.isoDateFrom);
    assert.equal(operationFilters.limit, 6);
    assert.equal(operationFilters.sortBy, "scheduledStart");
  });

  it("builds list hrefs with date preset fields", () => {
    const resolved = resolveHomeTodayIsoRange(REFERENCE_DATE);
    assert.ok(resolved);

    const operationsHref = buildDateRangeListHref("/operations", resolved.dateRange);
    assert.match(operationsHref, /^\/operations\?/);
    assert.match(operationsHref, /datePreset=today/);
    assert.match(operationsHref, /dateFrom=2026-08-20/);

    const statisticsHref = buildHomeStatisticsPageHref(resolved.dateRange);
    assert.match(statisticsHref, /^\/statistics\?/);
    assert.match(statisticsHref, /tab=general/);
  });
});
