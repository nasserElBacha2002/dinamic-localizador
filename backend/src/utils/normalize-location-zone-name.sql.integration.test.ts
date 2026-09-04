import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import sql from "mssql";
import { getPool } from "../database/connection";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import {
  LOCATION_ZONE_NORMALIZATION_GOLDEN_CASES,
  normalizeLocationZoneName,
} from "../utils/normalize-location-zone-name";

describeDatabaseIntegration("fn_normalize_location_zone_text matches Node", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("SQL function exists", async () => {
    const pool = getPool();
    const result = await pool.request().query(`
      SELECT OBJECT_ID(N'dbo.fn_normalize_location_zone_text', N'FN') AS fn_id
    `);
    assert.ok(result.recordset[0]?.fn_id, "fn_normalize_location_zone_text must exist after migration 109");
  });

  for (const { input, expected } of LOCATION_ZONE_NORMALIZATION_GOLDEN_CASES) {
    it(`SQL and Node agree on ${JSON.stringify(input)}`, async () => {
      assert.equal(normalizeLocationZoneName(input), expected);
      const pool = getPool();
      const result = await pool
        .request()
        .input("value", sql.NVarChar(120), input)
        .query(`SELECT dbo.fn_normalize_location_zone_text(@value) AS normalized`);
      assert.equal(String(result.recordset[0].normalized), expected);
    });
  }
});
