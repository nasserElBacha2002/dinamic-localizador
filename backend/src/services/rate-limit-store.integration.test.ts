import assert from "node:assert/strict";
import { after, before, it } from "node:test";
import {
  describeDatabaseIntegration,
  setupDatabaseIntegration,
  teardownDatabaseIntegration,
} from "../test-helpers/integration-test";
import { createSqlRateLimitStore, isRateLimitSchemaReady } from "./rate-limit-store";

describeDatabaseIntegration("SQL rate-limit store (multi-replica)", () => {
  before(async () => {
    await setupDatabaseIntegration();
  });

  after(async () => {
    await teardownDatabaseIntegration();
  });

  it("schema from migration 140 is available", async () => {
    assert.equal(await isRateLimitSchemaReady(), true);
  });

  it("shared counter across store A and store B", async () => {
    const key = `itest:shared:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const storeA = createSqlRateLimitStore();
    const storeB = createSqlRateLimitStore();
    const windowMs = 60_000;
    const max = 5;

    const a1 = await storeA.hit(key, windowMs, max);
    const b1 = await storeB.hit(key, windowMs, max);
    assert.equal(a1.count, 1);
    assert.equal(b1.count, 2);
    assert.equal(a1.allowed, true);
    assert.equal(b1.allowed, true);
  });

  it("concurrent first hit does not lose updates or throw duplicate-key", async () => {
    const key = `itest:concurrent:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const store = createSqlRateLimitStore();
    const windowMs = 60_000;
    const max = 100;

    const results = await Promise.all(
      Array.from({ length: 20 }, () => store.hit(key, windowMs, max)),
    );

    const counts = results.map((r) => r.count).sort((a, b) => a - b);
    assert.equal(counts[0], 1);
    assert.equal(counts[counts.length - 1], 20);
    assert.equal(new Set(counts).size, 20);
    assert.ok(results.every((r) => r.allowed));
  });

  it("threshold N allowed then N+1 denied", async () => {
    const key = `itest:threshold:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const store = createSqlRateLimitStore();
    const windowMs = 60_000;
    const max = 3;

    assert.equal((await store.hit(key, windowMs, max)).allowed, true);
    assert.equal((await store.hit(key, windowMs, max)).allowed, true);
    assert.equal((await store.hit(key, windowMs, max)).allowed, true);
    const denied = await store.hit(key, windowMs, max);
    assert.equal(denied.allowed, false);
    assert.equal(denied.count, 4);
  });

  it("window rollover resets count after expiry", async () => {
    const { getPool } = await import("../database/connection");
    const key = `itest:rollover:${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const store = createSqlRateLimitStore();
    const windowMs = 60_000;
    const max = 2;

    assert.equal((await store.hit(key, windowMs, max)).count, 1);
    assert.equal((await store.hit(key, windowMs, max)).count, 2);

    // Force expiry in SQL (avoids host↔container clock skew from short sleep windows).
    await getPool()
      .request()
      .input("bucketKey", key)
      .query(`
        UPDATE dbo.rate_limit_buckets
        SET expires_at_utc = DATEADD(second, -1, SYSUTCDATETIME())
        WHERE bucket_key = @bucketKey
      `);

    const after = await store.hit(key, windowMs, max);
    assert.equal(after.count, 1);
    assert.equal(after.allowed, true);
  });

  it("cleanup deletes expired buckets and preserves active ones", async () => {
    const { getPool } = await import("../database/connection");
    const store = createSqlRateLimitStore();
    const expiredKey = `itest:cleanup-exp:${Date.now()}`;
    const activeKey = `itest:cleanup-act:${Date.now()}`;
    const pool = getPool();

    await store.hit(expiredKey, 60_000, 10);
    await store.hit(activeKey, 60_000, 10);

    await pool
      .request()
      .input("expiredKey", expiredKey)
      .query(`
        UPDATE dbo.rate_limit_buckets
        SET expires_at_utc = DATEADD(second, -1, SYSUTCDATETIME())
        WHERE bucket_key = @expiredKey
      `);

    const deleted = await store.deleteExpiredBatch!(100);
    assert.ok(deleted >= 1);

    const remaining = await pool
      .request()
      .input("expiredKey", expiredKey)
      .input("activeKey", activeKey)
      .query(`
        SELECT bucket_key FROM dbo.rate_limit_buckets
        WHERE bucket_key IN (@expiredKey, @activeKey)
      `);
    const keys = remaining.recordset.map((r: { bucket_key: string }) => r.bucket_key);
    assert.equal(keys.includes(expiredKey), false);
    assert.equal(keys.includes(activeKey), true);
  });
});
