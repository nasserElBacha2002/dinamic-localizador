import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const routesSource = readFileSync(
  join(process.cwd(), "src/routes/user-invitation.routes.ts"),
  "utf8",
);

/**
 * LOC-P1-007 — legacy GET /invitations/preview vs preferred POST /preview.
 * Both must share the same controller, rate-limit class, and validation surface.
 */
describe("invitation legacy GET preview security parity", () => {
  it("documents GET preview as DEPRECATED while retained", () => {
    assert.match(routesSource, /DEPRECATED[\s\S]*publicInvitationRouter\.get\(\s*"\/preview"/);
  });

  it("preferred POST and legacy GET use the same controller handler", () => {
    assert.match(
      routesSource,
      /publicInvitationRouter\.post\(\s*"\/preview"[\s\S]*?userInvitationController\.preview/,
    );
    assert.match(
      routesSource,
      /publicInvitationRouter\.get\(\s*"\/preview"[\s\S]*?userInvitationController\.preview/,
    );
  });

  it("both preview routes apply invitation rate limiting", () => {
    assert.match(
      routesSource,
      /post\(\s*"\/preview"[\s\S]*?rateLimitInvitations\(\{ scope: "invite-preview"/,
    );
    assert.match(
      routesSource,
      /get\(\s*"\/preview"[\s\S]*?rateLimitInvitations\(\{ scope: "invite-preview-get"/,
    );
  });

  it("both preview routes validate token schemas (body vs query)", () => {
    assert.match(routesSource, /validate\(previewInvitationBodySchema\)/);
    assert.match(routesSource, /validate\(previewInvitationQuerySchema, "query"\)/);
  });

  it("workers/employees aliases mount the same employeeRouter (auth/tenant parity by shared mount)", () => {
    const index = readFileSync(join(process.cwd(), "src/routes/index.ts"), "utf8");
    assert.match(index, /router\.use\("\/employees", moduleGuard, employeeRouter\)/);
    assert.match(index, /router\.use\("\/workers", moduleGuard, employeeRouter\)/);
  });
});
