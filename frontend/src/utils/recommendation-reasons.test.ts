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
      "Cerca del servicio",
    );
    const lines = formatRecommendationReasons([
      { code: "LOCATION_PROXIMITY", params: { bucket: "VERY_CLOSE" } },
    ]);
    assert.equal(lines.some((line) => /Caballito|vive|barrio/i.test(line)), false);
  });

  it("formats LOCATION_PROXIMITY with approximate distance when present", () => {
    assert.equal(
      formatRecommendationReason({
        code: "LOCATION_PROXIMITY",
        params: { bucket: "CLOSE", distanceMeters: 2410 },
      }),
      "Aprox. 2,4 km del servicio",
    );
    assert.equal(
      formatRecommendationReason({
        code: "LOCATION_PROXIMITY",
        params: { bucket: "VERY_CLOSE", distanceMeters: 1200 },
      }),
      "Aprox. 1,2 km del servicio",
    );
    assert.equal(
      formatRecommendationReason({
        code: "LOCATION_PROXIMITY",
        params: { bucket: "MEDIUM", distanceMeters: 9800 },
      }),
      "Aprox. 9,8 km del servicio",
    );
    assert.equal(
      formatRecommendationReason({
        code: "LOCATION_PROXIMITY",
        params: { bucket: "FAR", distanceMeters: 28300 },
      }),
      "Aprox. 28 km del servicio",
    );
  });

  it("does not invent 0 km for SAME_ZONE and omits UNKNOWN", () => {
    assert.equal(
      formatRecommendationReason({
        code: "LOCATION_PROXIMITY",
        params: { bucket: "SAME_ZONE", distanceMeters: null },
      }),
      "Misma zona que el servicio",
    );
    assert.equal(
      formatRecommendationReason({
        code: "LOCATION_PROXIMITY",
        params: { bucket: "UNKNOWN" },
      }),
      null,
    );
  });

  it("falls back to bucket copy when distanceMeters is absent", () => {
    assert.equal(
      formatRecommendationReason({
        code: "LOCATION_PROXIMITY",
        params: { bucket: "CLOSE" },
      }),
      "Cerca del servicio",
    );
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

  it("maps team-level reason codes", () => {
    assert.equal(
      formatRecommendationReason({
        code: "TEAM_HISTORY_COVERAGE",
        params: { members: 6, membersWithConnections: 5 },
      }),
      "5 de los 6 integrantes ya tienen historial trabajando entre sí",
    );
    assert.equal(
      formatRecommendationReason({
        code: "TEAM_SERVICE_EXPERIENCE",
        params: { experiencedMembers: 4, teamSize: 6 },
      }),
      "4 de 6 tienen experiencia previa en esta sucursal",
    );
    assert.equal(
      formatRecommendationReason({
        code: "TEAM_LOCATION_PROXIMITY",
        params: { closeMembers: 4, teamSize: 6 },
      }),
      "4 de 6 tienen buena proximidad con la operación",
    );
    const loc = formatRecommendationReason({
      code: "TEAM_LOCATION_PROXIMITY",
      params: { closeMembers: 4, teamSize: 6 },
    });
    assert.equal(loc?.includes("Caballito"), false);
  });
});
