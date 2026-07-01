import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("attendance checkout persistence", () => {
  it("documents nullable checkout location columns in migration 007", () => {
    const migration = readFileSync(
      join(process.cwd(), "../database/migrations/007_attendance_checkout.sql"),
      "utf8",
    );

    assert.match(migration, /checkout_latitude DECIMAL\(10, 7\) NULL/);
    assert.match(migration, /checkout_longitude DECIMAL\(10, 7\) NULL/);
    assert.match(migration, /checkout_distance_meters DECIMAL\(10, 2\) NULL/);
  });

  it("allows null checkout coordinates in registerCheckoutInTransaction input", () => {
    const repositorySource = readFileSync(
      join(process.cwd(), "src/repositories/attendance.repository.ts"),
      "utf8",
    );

    assert.match(repositorySource, /checkoutLatitude: number \| null/);
    assert.match(repositorySource, /checkoutLongitude: number \| null/);
    assert.match(repositorySource, /checkoutDistanceMeters: number \| null/);
  });
});
