import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSeedEnvironmentSafe, parseHistoricalSeedCliArgs } from "./cli-args";
import { offsetCoordinatesMeters, randomPointWithinRadius } from "./geo";
import {
  buildBatchMarker,
  generateBatchId,
  isCycleIntegrationName,
} from "./markers";
import { planHistoricalSeed } from "./planner";
import { createSeedRandom } from "./random";
import type { SeedEmployee, SeedService } from "./types";

describe("historical-seed random", () => {
  it("is reproducible for the same seed", () => {
    const a = createSeedRandom(42);
    const b = createSeedRandom(42);
    const seqA = [a.next(), a.next(), a.int(1, 10), a.chance(0.5)];
    const seqB = [b.next(), b.next(), b.int(1, 10), b.chance(0.5)];
    assert.deepEqual(seqA, seqB);
  });

  it("diverges for different seeds", () => {
    const a = createSeedRandom(1);
    const b = createSeedRandom(2);
    assert.notEqual(a.next(), b.next());
  });
});

describe("historical-seed markers", () => {
  it("excludes Cycle integration names case-insensitively", () => {
    assert.equal(isCycleIntegrationName("Cycle integration"), true);
    assert.equal(isCycleIntegrationName("CYCLE INTEGRATION 1"), true);
    assert.equal(isCycleIntegrationName("Cycle Integration test"), true);
    assert.equal(isCycleIntegrationName("Juan Pérez"), false);
  });

  it("builds stable batch markers", () => {
    assert.equal(buildBatchMarker("ai-history-20260814-abc"), "[AI_HISTORY_SEED:ai-history-20260814-abc]");
    assert.match(generateBatchId(123, new Date("2026-08-14T12:00:00Z")), /^ai-history-20260814-/);
  });
});

describe("historical-seed geo", () => {
  it("offsets meters without naive lat+random", () => {
    const point = offsetCoordinatesMeters(-34.6, -58.38, 100, 0);
    assert.ok(Math.abs(point.latitude + 34.6) < 1e-6);
    assert.ok(point.longitude > -58.38);
  });

  it("keeps random points within radius", () => {
    const rng = createSeedRandom(7);
    for (let i = 0; i < 20; i += 1) {
      const sample = randomPointWithinRadius(-34.6, -58.38, 150, () => rng.next());
      assert.ok(sample.distanceMeters <= 150);
    }
  });
});

describe("historical-seed planner", () => {
  const employees: SeedEmployee[] = Array.from({ length: 12 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    name: `Employee ${i}`,
  }));
  const services: SeedService[] = Array.from({ length: 5 }, (_, i) => ({
    id: `10000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    name: `Service ${i}`,
    latitude: -34.6 + i * 0.01,
    longitude: -58.38,
    allowedRadiusMeters: 150,
    locationZoneId: null,
  }));

  it("plans deterministic operations without future dates", () => {
    const planA = planHistoricalSeed({
      companyId: "company",
      employees,
      services,
      operations: 20,
      monthsBack: 12,
      seed: 99,
      timezone: "America/Argentina/Buenos_Aires",
      todayIso: "2026-08-14",
      batchId: "ai-history-test-99",
    });
    const planB = planHistoricalSeed({
      companyId: "company",
      employees,
      services,
      operations: 20,
      monthsBack: 12,
      seed: 99,
      timezone: "America/Argentina/Buenos_Aires",
      todayIso: "2026-08-14",
      batchId: "ai-history-test-99",
    });

    assert.equal(planA.operations.length, 20);
    assert.deepEqual(
      planA.operations.map((o) => o.workDate),
      planB.operations.map((o) => o.workDate),
    );
    for (const op of planA.operations) {
      assert.ok(op.workDate < "2026-08-14");
      assert.ok(op.assignments.length >= 2);
    }
    assert.ok(planA.clusters.length >= 1);
    assert.ok(planA.expectedStrongPairs.length > 0);
  });

  it("mixes individual and work_team modes", () => {
    const plan = planHistoricalSeed({
      companyId: "company",
      employees,
      services,
      operations: 40,
      monthsBack: 12,
      seed: 11,
      timezone: "America/Argentina/Buenos_Aires",
      todayIso: "2026-08-14",
    });
    const modes = new Set(plan.operations.map((o) => o.mode));
    assert.ok(modes.has("individual"));
    assert.ok(modes.has("work_team"));
  });
});

describe("historical-seed cli-args", () => {
  it("parses flags", () => {
    const parsed = parseHistoricalSeedCliArgs([
      "--company-id",
      "abc",
      "--operations",
      "12",
      "--months-back",
      "6",
      "--seed",
      "5",
      "--dry-run",
    ]);
    assert.equal(parsed.companyId, "abc");
    assert.equal(parsed.operations, 12);
    assert.equal(parsed.monthsBack, 6);
    assert.equal(parsed.seed, 5);
    assert.equal(parsed.dryRun, true);
  });

  it("blocks production and missing allow flag", () => {
    assert.throws(() => assertSeedEnvironmentSafe({ NODE_ENV: "production" } as NodeJS.ProcessEnv));
    assert.throws(() =>
      assertSeedEnvironmentSafe({ NODE_ENV: "development" } as NodeJS.ProcessEnv),
    );
    assert.doesNotThrow(() =>
      assertSeedEnvironmentSafe({
        NODE_ENV: "development",
        ALLOW_SYNTHETIC_OPERATION_SEED: "true",
      } as NodeJS.ProcessEnv),
    );
  });
});
