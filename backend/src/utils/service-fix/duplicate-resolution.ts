import { compareCurrentAddressToOfficial, pickReportRowForService, recomputeCoordinateDistance } from "./current-db";
import type { CurrentDbState, DuplicateResolutionRow, ReconciliationReportRow } from "./types";
import type { OfficialSourceRow } from "./csv";

export const officialDuplicateNumbers = (
  duplicateRows: Array<{ source: string; serviceNumber: string }>,
  officialRows: OfficialSourceRow[],
): Set<string> => {
  const numbers = new Set<string>();

  for (const row of duplicateRows) {
    if (row.source === "official" && row.serviceNumber) {
      numbers.add(row.serviceNumber);
    }
  }

  const officialCounts = new Map<string, number>();
  for (const row of officialRows) {
    officialCounts.set(row.serviceNumber, (officialCounts.get(row.serviceNumber) ?? 0) + 1);
  }

  for (const [serviceNumber, count] of officialCounts.entries()) {
    if (count > 1) {
      numbers.add(serviceNumber);
    }
  }

  return numbers;
};

export const buildDuplicateResolutionFromCurrentDb = (
  currentDb: CurrentDbState,
  reportRows: ReconciliationReportRow[],
  officialDupes: Set<string>,
): DuplicateResolutionRow[] => {
  const resolution: DuplicateResolutionRow[] = [];

  for (const [serviceNumber, rows] of currentDb.duplicateNumericGroups.entries()) {
    if (rows.length <= 1) {
      continue;
    }

    const report = pickReportRowForService(serviceNumber, reportRows);
    const officialAddress = report?.carrefourOfficialAddress ?? "";

    const scored = rows.map((row) => {
      const distance = report
        ? recomputeCoordinateDistance(row, report.geocodedLatitude, report.geocodedLongitude)
        : null;
      const addressComparison = officialAddress
        ? compareCurrentAddressToOfficial(row.address, officialAddress)
        : null;

      let score = 0;
      if (distance !== null && distance <= 100) {
        score += 1000;
      }
      if (distance !== null) {
        score += Math.max(0, 1000 - distance);
      }
      if (addressComparison?.status === "exact_match") {
        score += 200;
      } else if (addressComparison?.status === "likely_match") {
        score += 100;
      }
      if (row.googlePlaceId) {
        score += 50;
      }
      if (row.updatedAt) {
        score += 1;
      }

      return {
        row,
        distance,
        addressComparison,
        score,
      };
    });

    scored.sort((left, right) => right.score - left.score);
    const winner = scored[0];
    const runnerUp = scored[1];
    const ambiguous =
      officialDupes.has(serviceNumber) ||
      (winner &&
        runnerUp &&
        Math.abs(winner.score - runnerUp.score) < 50 &&
        winner.distance !== null &&
        runnerUp.distance !== null &&
        Math.abs(winner.distance - runnerUp.distance) < 100);

    for (const entry of scored) {
      const isWinner = entry.row.id === winner?.row.id;
      resolution.push({
        serviceNumber,
        dbId: entry.row.id,
        address: entry.row.address,
        latitude: entry.row.latitude === null ? "" : String(entry.row.latitude),
        longitude: entry.row.longitude === null ? "" : String(entry.row.longitude),
        coordinateDistanceMeters:
          entry.distance === null ? "" : String(Math.round(entry.distance * 100) / 100),
        addressMatchStatus: entry.addressComparison?.status ?? "",
        recommendation: isWinner
          ? ambiguous
            ? "review"
            : "keep"
          : ambiguous
            ? "review"
            : "deactivate",
        reason: officialDupes.has(serviceNumber)
          ? "Official source has duplicate service numbers"
          : isWinner
            ? ambiguous
              ? "Top candidate but duplicate group is ambiguous"
              : "Best coordinate/address match in current DB duplicate group"
            : ambiguous
              ? "Ambiguous duplicate group"
              : "Worse coordinate/address match than recommended keeper",
      });
    }
  }

  return resolution;
};
