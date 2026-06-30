import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatBotDateDDMMYYYY,
  parseBotDateDDMMYYYY,
  parseSpanishDateInput,
} from "./bot-date.parser";

const timezone = "America/Argentina/Buenos_Aires";

describe("parseSpanishDateInput via bot-date.parser", () => {
  it("accepts DD/MM/YYYY as day/month/year", () => {
    assert.deepEqual(parseSpanishDateInput("05/07/2026"), {
      year: 2026,
      month: 7,
      day: 5,
      iso: "2026-07-05",
    });
  });

  it("rejects MM/DD/YYYY when invalid as DD/MM/YYYY", () => {
    assert.equal(parseSpanishDateInput("07/31/2026"), null);
  });
});

describe("parseBotDateDDMMYYYY", () => {
  it("parses 05/07/2026 as 5 July 2026", () => {
    const date = parseBotDateDDMMYYYY("05/07/2026", timezone);
    assert.ok(date);
    assert.equal(date?.toISOString().slice(0, 10), "2026-07-05");
  });

  it("accepts 31/07/2026", () => {
    const date = parseBotDateDDMMYYYY("31/07/2026", timezone);
    assert.ok(date);
    assert.equal(date?.toISOString().slice(0, 10), "2026-07-31");
  });

  it("rejects invalid dates", () => {
    assert.equal(parseBotDateDDMMYYYY("31/02/2026", timezone), null);
    assert.equal(parseBotDateDDMMYYYY("2026-07-05", timezone), null);
  });
});

describe("formatBotDateDDMMYYYY", () => {
  it("formats calendar date in timezone", () => {
    const formatted = formatBotDateDDMMYYYY(
      new Date("2026-07-05T12:00:00.000Z"),
      timezone,
    );
    assert.equal(formatted, "05/07/2026");
  });
});
