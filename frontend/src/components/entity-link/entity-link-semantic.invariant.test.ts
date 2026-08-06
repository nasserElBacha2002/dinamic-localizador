import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Semantic regression: service labels must never fall back to operation ids.
 */
describe("entity link semantic invariants (source)", () => {
  it("AbsenceDetailPage does not link serviceName via operationId", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/pages/absences/AbsenceDetailPage.tsx"),
      "utf8",
    );
    assert.equal(source.includes('entityType={row.serviceId ? "service" : "operation"}'), false);
    assert.equal(source.includes("row.serviceId || row.operationId"), false);
    assert.match(source, /entityType="service"[\s\S]*entityId=\{row\.serviceId\}/);
    assert.match(source, /entityType="operation"[\s\S]*entityId=\{row\.operationId\}/);
  });

  it("WorkTeamDetailPage links Servicio to serviceId, not operationId", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/pages/work-teams/WorkTeamDetailPage.tsx"),
      "utf8",
    );
    const servicioColumn = source.match(
      /key:\s*"serviceName",[\s\S]*?key:\s*"operation"/,
    )?.[0];
    assert.ok(servicioColumn, "expected Servicio column block");
    assert.match(servicioColumn, /entityType="service"/);
    assert.match(servicioColumn, /entityId=\{row\.serviceId\}/);
    assert.equal(servicioColumn.includes('entityType="operation"'), false);
    assert.match(
      source,
      /key:\s*"operation",[\s\S]*?entityType="operation"[\s\S]*?entityId=\{row\.operationId\}/,
    );
  });

  it("EntityLink CSS does not use generated class name substring selectors", () => {
    const css = readFileSync(
      resolve(process.cwd(), "src/components/entity-link/EntityLink.module.css"),
      "utf8",
    );
    assert.equal(css.includes('class*="identityTitle"'), false);
    assert.equal(css.includes(":global([class*="), false);
  });
});
