import sql from "mssql";
import { getPool } from "../database/connection";

export type RateLimitHitResult = {
  allowed: boolean;
  count: number;
  resetAt: number;
};

export type RateLimitStore = {
  hit(key: string, windowMs: number, max: number): Promise<RateLimitHitResult>;
  /** Delete expired buckets in a bounded batch. Returns rows deleted. */
  deleteExpiredBatch?(batchSize: number): Promise<number>;
};

type MemoryBucket = { count: number; resetAt: number };

export function createMemoryRateLimitStore(
  buckets: Map<string, MemoryBucket> = new Map(),
): RateLimitStore {
  return {
    async hit(key, windowMs, max) {
      const now = Date.now();
      const existing = buckets.get(key);
      if (!existing || existing.resetAt <= now) {
        const resetAt = now + windowMs;
        buckets.set(key, { count: 1, resetAt });
        return { allowed: true, count: 1, resetAt };
      }

      existing.count += 1;
      return {
        allowed: existing.count <= max,
        count: existing.count,
        resetAt: existing.resetAt,
      };
    },
    async deleteExpiredBatch(batchSize) {
      const now = Date.now();
      let deleted = 0;
      for (const [key, bucket] of buckets) {
        if (deleted >= batchSize) {
          break;
        }
        if (bucket.resetAt <= now) {
          buckets.delete(key);
          deleted += 1;
        }
      }
      return deleted;
    },
  };
}

/**
 * True when dbo.rate_limit_buckets exists (migration 140 applied).
 * Used by readiness when RATE_LIMIT_BACKEND=sql.
 */
export async function isRateLimitSchemaReady(): Promise<boolean> {
  const pool = getPool();
  const result = await pool.request().query(`
    SELECT CASE
      WHEN OBJECT_ID(N'dbo.rate_limit_buckets', N'U') IS NULL THEN 0
      ELSE 1
    END AS ready
  `);
  return Number(result.recordset[0]?.ready) === 1;
}

/**
 * SQL Server shared counter. Atomic per key via UPDLOCK/HOLDLOCK on the bucket row.
 * Multi-replica safe when all instances use this store.
 */
export function createSqlRateLimitStore(): RateLimitStore {
  return {
    async hit(key, windowMs, max) {
      const pool = getPool();
      const now = new Date();
      const windowStart = now;
      const expiresAt = new Date(now.getTime() + windowMs);

      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        const locked = await new sql.Request(transaction)
          .input("key", sql.NVarChar(300), key)
          .query(`
            SELECT bucket_key, window_start_utc, hit_count, expires_at_utc
            FROM dbo.rate_limit_buckets WITH (UPDLOCK, HOLDLOCK, ROWLOCK)
            WHERE bucket_key = @key
          `);

        const row = locked.recordset[0] as
          | {
              bucket_key: string;
              window_start_utc: Date;
              hit_count: number;
              expires_at_utc: Date;
            }
          | undefined;

        let count: number;
        let resetAt: Date;

        if (!row || new Date(row.expires_at_utc).getTime() <= now.getTime()) {
          count = 1;
          resetAt = expiresAt;
          await new sql.Request(transaction)
            .input("key", sql.NVarChar(300), key)
            .input("windowStart", sql.DateTime2, windowStart)
            .input("hitCount", sql.Int, count)
            .input("expiresAt", sql.DateTime2, expiresAt)
            .query(`
              MERGE dbo.rate_limit_buckets AS target
              USING (SELECT @key AS bucket_key) AS src
              ON target.bucket_key = src.bucket_key
              WHEN MATCHED THEN UPDATE SET
                window_start_utc = @windowStart,
                hit_count = @hitCount,
                expires_at_utc = @expiresAt,
                updated_at_utc = SYSUTCDATETIME()
              WHEN NOT MATCHED THEN INSERT (bucket_key, window_start_utc, hit_count, expires_at_utc)
                VALUES (@key, @windowStart, @hitCount, @expiresAt);
            `);
        } else {
          count = Number(row.hit_count) + 1;
          resetAt = new Date(row.expires_at_utc);
          await new sql.Request(transaction)
            .input("key", sql.NVarChar(300), key)
            .input("hitCount", sql.Int, count)
            .query(`
              UPDATE dbo.rate_limit_buckets
              SET hit_count = @hitCount,
                  updated_at_utc = SYSUTCDATETIME()
              WHERE bucket_key = @key
            `);
        }

        await transaction.commit();
        return {
          allowed: count <= max,
          count,
          resetAt: resetAt.getTime(),
        };
      } catch (error) {
        try {
          await transaction.rollback();
        } catch {
          // ignore rollback errors
        }
        throw error;
      }
    },

    async deleteExpiredBatch(batchSize) {
      const pool = getPool();
      const safeBatch = Math.max(1, Math.min(batchSize, 5000));
      const result = await pool
        .request()
        .input("batchSize", sql.Int, safeBatch)
        .query(`
          DELETE FROM dbo.rate_limit_buckets
          WHERE bucket_key IN (
            SELECT TOP (@batchSize) bucket_key
            FROM dbo.rate_limit_buckets WITH (READPAST)
            WHERE expires_at_utc < SYSUTCDATETIME()
            ORDER BY expires_at_utc
          );
          SELECT @@ROWCOUNT AS deleted;
        `);
      const sets = Array.isArray(result.recordsets)
        ? result.recordsets
        : [result.recordset];
      const last = sets[sets.length - 1] as Array<{ deleted?: number }> | undefined;
      return Number(last?.[0]?.deleted ?? 0);
    },
  };
}
