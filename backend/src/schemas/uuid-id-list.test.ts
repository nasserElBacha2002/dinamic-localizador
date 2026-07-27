import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertWithinMultiFilterLimit,
  MAX_MULTI_FILTER_IDS,
  mergeLegacySingularId,
  parseUuidIdList,
  uuidIdListSchema,
} from "./uuid-id-list";
import { listAttendanceQuerySchema } from "./attendance.schema";
import { assignEmployeesBatchSchema } from "./assignment.schema";

const ID_A = "11111111-1111-4111-8111-111111111111";
const ID_B = "22222222-2222-4222-8222-222222222222";
const ID_C = "33333333-3333-4333-8333-333333333333";

describe("uuid-id-list", () => {
  it("parses comma-separated and repeated values", () => {
    assert.deepEqual(parseUuidIdList(`${ID_A},${ID_B},${ID_A}`), [ID_A, ID_B]);
    assert.deepEqual(parseUuidIdList([ID_A, `${ID_B},${ID_A}`]), [ID_A, ID_B]);
  });

  it("validates UUIDs via schema", () => {
    const parsed = uuidIdListSchema.parse(`${ID_A},${ID_B}`);
    assert.deepEqual(parsed, [ID_A, ID_B]);
    assert.throws(() => uuidIdListSchema.parse("not-a-uuid"));
  });

  it("merges singular after plural without dropping either", () => {
    assert.deepEqual(mergeLegacySingularId([], ID_A), [ID_A]);
    assert.deepEqual(mergeLegacySingularId([ID_B, ID_C], ID_A), [ID_B, ID_C, ID_A]);
    assert.deepEqual(mergeLegacySingularId([ID_A, ID_B], ID_A), [ID_A, ID_B]);
  });

  it("rejects lists above the multi-filter limit", () => {
    const ids = Array.from({ length: MAX_MULTI_FILTER_IDS + 1 }, (_, index) => {
      const hex = (index + 1).toString(16).padStart(12, "0");
      return `11111111-1111-4111-8111-${hex}`;
    });
    assert.throws(() => assertWithinMultiFilterLimit(ids));
    assert.equal(assertWithinMultiFilterLimit(ids.slice(0, MAX_MULTI_FILTER_IDS)).length, MAX_MULTI_FILTER_IDS);
  });

  it("accepts 100 unique ids after dedupe of duplicates", () => {
    const base = Array.from({ length: MAX_MULTI_FILTER_IDS }, (_, index) => {
      const hex = (index + 1).toString(16).padStart(12, "0");
      return `11111111-1111-4111-8111-${hex}`;
    });
    const withDupes = [...base, base[0], base[1]];
    const parsed = uuidIdListSchema.parse(withDupes.join(","));
    assert.equal(parsed.length, MAX_MULTI_FILTER_IDS);
  });
});

describe("listAttendanceQuerySchema multi ids", () => {
  it("accepts employeeIds list and merges legacy employeeId", () => {
    const fromList = listAttendanceQuerySchema.parse({
      employeeIds: `${ID_A},${ID_B}`,
    });
    assert.deepEqual(fromList.employeeIds, [ID_A, ID_B]);

    const fromLegacy = listAttendanceQuerySchema.parse({
      employeeId: ID_A,
    });
    assert.deepEqual(fromLegacy.employeeIds, [ID_A]);

    const merged = listAttendanceQuerySchema.parse({
      employeeId: ID_A,
      employeeIds: `${ID_B},${ID_C}`,
    });
    assert.deepEqual(merged.employeeIds, [ID_B, ID_C, ID_A]);
  });
});

describe("assignEmployeesBatchSchema", () => {
  it("requires at least one employee id", () => {
    assert.throws(() => assignEmployeesBatchSchema.parse({ employeeIds: [] }));
    const ok = assignEmployeesBatchSchema.parse({ employeeIds: [ID_A, ID_B] });
    assert.deepEqual(ok.employeeIds, [ID_A, ID_B]);
  });
});
