import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { setupUnitTestEnv } from "../../test-helpers/unit-test-env";

setupUnitTestEnv();

import { env } from "../../config/env";
import { buildAbsenceRequestAdminUrl } from "./absence-request-admin-url";

describe("buildAbsenceRequestAdminUrl", () => {
  const originalUrl = env.FRONTEND_URL;

  afterEach(() => {
    (env as { FRONTEND_URL: string }).FRONTEND_URL = originalUrl;
  });

  it("builds admin deep link from FRONTEND_URL", () => {
    (env as { FRONTEND_URL: string }).FRONTEND_URL = "https://app.dinamicoperations.com";
    assert.equal(
      buildAbsenceRequestAdminUrl("req-42"),
      "https://app.dinamicoperations.com/absences/req-42",
    );
  });
});
