import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatAffinityLabel,
  formatAffinityPercent,
  formatRecommendationReason,
  formatRecommendationReasons,
} from "./recommendation-reasons";

describe("recommendation-reasons", () => {
  it("formats affinity as percentage, not probability language", () => {
    assert.equal(formatAffinityPercent(0.87), "87%");
    assert.equal(formatAffinityLabel(0.87), "87% de afinidad");
    assert.equal(formatAffinityPercent(1), "100%");
    assert.equal(formatAffinityPercent(0), "0%");
  });

  it("maps TEAM_AFFINITY with metadata", () => {
    assert.equal(
      formatRecommendationReason({
        code: "TEAM_AFFINITY",
        params: { matchedTeamMembers: 3, sharedOccurrences: 12 },
      }),
      "Trabajó 12 veces con 3 integrantes del equipo actual",
    );
  });

  it("maps SERVICE_EXPERIENCE with serviceWorkdays (not operations)", () => {
    const line = formatRecommendationReason({
      code: "SERVICE_EXPERIENCE",
      params: { serviceWorkdays: 5 },
    });
    assert.equal(line, "Trabajó 5 jornadas anteriores en esta sucursal");
    assert.equal(line?.includes("operacion"), false);
  });

  it("maps LOCATION_PROXIMITY buckets without revealing residence", () => {
    assert.equal(
      formatRecommendationReason({
        code: "LOCATION_PROXIMITY",
        params: { bucket: "CLOSE" },
      }),
      "Su zona está cerca de la operación",
    );
    const lines = formatRecommendationReasons([
      { code: "LOCATION_PROXIMITY", params: { bucket: "VERY_CLOSE" } },
    ]);
    assert.equal(lines.some((line) => /Caballito|vive|barrio/i.test(line)), false);
  });

  it("maps RECENT_COLLABORATION", () => {
    assert.equal(
      formatRecommendationReason({ code: "RECENT_COLLABORATION" }),
      "Trabajó recientemente con integrantes del equipo",
    );
  });

  it("degrades unknown reason codes without exposing the raw code", () => {
    const line = formatRecommendationReason({ code: "FUTURE_SIGNAL_X" as never });
    assert.equal(line, "Motivo adicional considerado por la IA");
    assert.equal(line?.includes("FUTURE_SIGNAL"), false);
  });
});
