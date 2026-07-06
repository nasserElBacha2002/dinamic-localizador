import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatDateRangeDisplay,
  getDateRangePresetLabel,
  getDefaultOperationDateRange,
  getDefaultPresetsForMode,
  getDefaultStatisticsDateRange,
  getDateRangeQueryValue,
  isDateRangeValid,
  isInvalidCustomDateRange,
  normalizeDateRangePresets,
  resolveDateRangePreset,
  validateCustomDateRange,
} from "./date-range";

const REFERENCE_DATE = "2026-06-25";

describe("resolveDateRangePreset", () => {
  it("resolves today", () => {
    assert.deepEqual(resolveDateRangePreset("today", REFERENCE_DATE), {
      preset: "today",
      from: "2026-06-25",
      to: "2026-06-25",
    });
  });

  it("resolves yesterday and tomorrow", () => {
    assert.deepEqual(resolveDateRangePreset("yesterday", REFERENCE_DATE), {
      preset: "yesterday",
      from: "2026-06-24",
      to: "2026-06-24",
    });
    assert.deepEqual(resolveDateRangePreset("tomorrow", REFERENCE_DATE), {
      preset: "tomorrow",
      from: "2026-06-26",
      to: "2026-06-26",
    });
  });

  it("resolves week presets", () => {
    assert.deepEqual(resolveDateRangePreset("this_week", REFERENCE_DATE), {
      preset: "this_week",
      from: "2026-06-22",
      to: "2026-06-28",
    });
    assert.deepEqual(resolveDateRangePreset("last_week", REFERENCE_DATE), {
      preset: "last_week",
      from: "2026-06-15",
      to: "2026-06-21",
    });
    assert.deepEqual(resolveDateRangePreset("next_week", REFERENCE_DATE), {
      preset: "next_week",
      from: "2026-06-29",
      to: "2026-07-05",
    });
  });

  it("resolves month presets", () => {
    assert.deepEqual(resolveDateRangePreset("this_month", REFERENCE_DATE), {
      preset: "this_month",
      from: "2026-06-01",
      to: "2026-06-30",
    });
    assert.deepEqual(resolveDateRangePreset("last_month", REFERENCE_DATE), {
      preset: "last_month",
      from: "2026-05-01",
      to: "2026-05-31",
    });
    assert.deepEqual(resolveDateRangePreset("next_month", REFERENCE_DATE), {
      preset: "next_month",
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("resolves rolling ranges", () => {
    assert.deepEqual(resolveDateRangePreset("last_7_days", REFERENCE_DATE), {
      preset: "last_7_days",
      from: "2026-06-19",
      to: "2026-06-25",
    });
    assert.deepEqual(resolveDateRangePreset("next_7_days", REFERENCE_DATE), {
      preset: "next_7_days",
      from: "2026-06-25",
      to: "2026-07-01",
    });
    assert.deepEqual(resolveDateRangePreset("last_30_days", REFERENCE_DATE), {
      preset: "last_30_days",
      from: "2026-05-27",
      to: "2026-06-25",
    });
    assert.deepEqual(resolveDateRangePreset("next_30_days", REFERENCE_DATE), {
      preset: "next_30_days",
      from: "2026-06-25",
      to: "2026-07-24",
    });
  });
});

describe("Spanish preset labels", () => {
  it("returns Spanish labels for presets", () => {
    assert.equal(getDateRangePresetLabel("today"), "Hoy");
    assert.equal(getDateRangePresetLabel("custom"), "Rango personalizado");
  });

  it("formats display text in Spanish", () => {
    assert.equal(formatDateRangeDisplay({ preset: null, from: null, to: null }), "Todas las fechas");
    assert.equal(
      formatDateRangeDisplay({
        preset: "custom",
        from: "2026-06-01",
        to: "2026-06-30",
      }),
      "Rango personalizado: 01/06/2026 - 30/06/2026",
    );
  });
});

describe("normalizeDateRangePresets", () => {
  it("deduplicates presets and includes custom once", () => {
    const normalized = normalizeDateRangePresets(
      ["today", "today", "custom", "yesterday", "custom"],
      true,
    );
    assert.deepEqual(normalized, ["today", "yesterday", "custom"]);
  });

  it("removes custom when allowCustomRange is false", () => {
    const normalized = normalizeDateRangePresets(["today", "custom", "custom"], false);
    assert.deepEqual(normalized, ["today"]);
  });
});

describe("getDefaultPresetsForMode", () => {
  it("returns past presets", () => {
    const presets = getDefaultPresetsForMode("past");
    assert.ok(presets.includes("last_30_days"));
    assert.ok(!presets.includes("next_week"));
  });

  it("returns future presets", () => {
    const presets = getDefaultPresetsForMode("future");
    assert.ok(presets.includes("next_week"));
    assert.ok(!presets.includes("last_month"));
  });

  it("returns mixed presets", () => {
    const presets = getDefaultPresetsForMode("mixed");
    assert.ok(presets.includes("yesterday"));
    assert.ok(presets.includes("tomorrow"));
    assert.ok(presets.includes("next_week"));
  });
});

describe("validateCustomDateRange", () => {
  it("accepts valid custom ranges", () => {
    const result = validateCustomDateRange("2026-06-01", "2026-06-30");
    assert.equal(result.isValid, true);
  });

  it("rejects missing dates", () => {
    assert.equal(validateCustomDateRange(null, "2026-06-30").isValid, false);
    assert.equal(validateCustomDateRange("2026-06-01", null).isValid, false);
  });

  it("rejects inverted ranges", () => {
    const result = validateCustomDateRange("2026-06-30", "2026-06-01");
    assert.equal(result.isValid, false);
    assert.equal(result.rangeError, "La fecha desde no puede ser posterior a la fecha hasta");
  });
});

describe("getDateRangeQueryValue", () => {
  it("returns query values for valid preset ranges", () => {
    const value = resolveDateRangePreset("today", REFERENCE_DATE);
    assert.deepEqual(getDateRangeQueryValue(value), {
      from: "2026-06-25",
      to: "2026-06-25",
    });
  });

  it("does not map invalid custom ranges", () => {
    assert.deepEqual(
      getDateRangeQueryValue({ preset: "custom", from: "2026-06-30", to: "2026-06-01" }),
      { from: undefined, to: undefined },
    );
  });

  it("does not map incomplete custom ranges", () => {
    assert.deepEqual(
      getDateRangeQueryValue({ preset: "custom", from: "2026-06-01", to: null }),
      { from: undefined, to: undefined },
    );
  });

  it("allows temporary invalid state in value while blocking API mapping", () => {
    const invalidValue = { preset: "custom" as const, from: "2026-06-30", to: "2026-06-01" };
    assert.equal(isDateRangeValid(invalidValue), false);
    assert.deepEqual(getDateRangeQueryValue(invalidValue), {
      from: undefined,
      to: undefined,
    });
  });
});

describe("isInvalidCustomDateRange", () => {
  it("detects invalid custom ranges", () => {
    assert.equal(isInvalidCustomDateRange({ preset: "custom", from: null, to: null }), true);
    assert.equal(isInvalidCustomDateRange({ preset: "custom", from: "2026-06-01", to: null }), true);
    assert.equal(
      isInvalidCustomDateRange({ preset: "custom", from: "2026-06-30", to: "2026-06-01" }),
      true,
    );
    assert.equal(
      isInvalidCustomDateRange({ preset: "custom", from: "2026-06-01", to: "2026-06-30" }),
      false,
    );
    assert.equal(
      isInvalidCustomDateRange({ preset: "today", from: "2026-06-30", to: "2026-06-30" }),
      false,
    );
  });
});

describe("default date ranges", () => {
  it("uses today for inventories", () => {
    const value = getDefaultOperationDateRange(REFERENCE_DATE);
    assert.equal(value.preset, "today");
    assert.equal(getDateRangePresetLabel(value.preset!), "Hoy");
  });

  it("uses last 30 days for statistics", () => {
    const value = getDefaultStatisticsDateRange(REFERENCE_DATE);
    assert.equal(value.preset, "last_30_days");
    assert.equal(getDateRangePresetLabel(value.preset!), "Últimos 30 días");
  });
});
