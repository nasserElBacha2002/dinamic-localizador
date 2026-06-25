import { normalizeAddress } from "../store-reconciliation/address";
import {
  isLabelOnlyOfficialAddress,
  isMalformedOfficialAddress,
} from "./address-heuristics";
import {
  compareCurrentAddressToOfficial,
  detectReportDrift,
  getCurrentRowsForStoreNumber,
  pickReportRowForStore,
  recomputeCoordinateDistance,
  recomputeCoordinateStatus,
} from "./current-db";
import type { OfficialSourceRow } from "./csv";
import {
  buildDuplicateResolutionFromCurrentDb,
  officialDuplicateNumbers,
} from "./duplicate-resolution";
import type {
  CurrentDbState,
  DuplicateReportRow,
  EnvironmentSnapshot,
  FixConfidence,
  FixPlan,
  FixPlanOptions,
  FixType,
  MissingInsertPlanRow,
  ProposedFix,
  ReconciliationReportRow,
  SkippedFix,
} from "./types";

const CRITICAL_DISTANCE_METERS = 10_000;

const parseNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
};

const hasCoordinates = (latitude: string, longitude: string): boolean =>
  parseNumber(latitude) !== null && parseNumber(longitude) !== null;

const classifyCoordinateFix = (
  distance: number,
  includeReviewCoordinates: boolean,
): { fixType: FixType; applyByDefault: boolean; confidence: FixConfidence } => {
  if (distance > CRITICAL_DISTANCE_METERS) {
    return {
      fixType: "CRITICAL_COORDINATE_FIX",
      applyByDefault: true,
      confidence: "high",
    };
  }

  if (distance > 300) {
    return {
      fixType: "AUTO_FIX_COORDINATE",
      applyByDefault: true,
      confidence: "high",
    };
  }

  return {
    fixType: "REVIEW_COORDINATE_FIX",
    applyByDefault: includeReviewCoordinates,
    confidence: "medium",
  };
};

const uniqueStoreNumbers = (rows: ReconciliationReportRow[]): string[] => {
  const numbers = new Set<string>();
  for (const row of rows) {
    if (row.storeNumber) {
      numbers.add(row.storeNumber);
    }
  }
  return [...numbers];
};

const formatCoordinate = (value: number | null): string =>
  value === null ? "" : String(value);

const appendNote = (base: string, notes: string[]): string => {
  if (notes.length === 0) {
    return base;
  }

  return `${base}; ${notes.join(", ")}`;
};

const resolveKeeperForDuplicateGroup = (
  storeNumber: string,
  duplicateResolution: ReturnType<typeof buildDuplicateResolutionFromCurrentDb>,
): string | undefined =>
  duplicateResolution.find(
    (entry) => entry.storeNumber === storeNumber && entry.recommendation === "keep",
  )?.dbId;

export const buildFixPlan = (
  summaryRows: ReconciliationReportRow[],
  missingRows: ReconciliationReportRow[],
  duplicateRows: DuplicateReportRow[],
  addressMismatchRows: ReconciliationReportRow[],
  coordinateMismatchRows: ReconciliationReportRow[],
  officialRows: OfficialSourceRow[],
  currentDb: CurrentDbState,
  environmentSnapshot: EnvironmentSnapshot,
  options: FixPlanOptions,
): FixPlan => {
  const proposed: ProposedFix[] = [];
  const skipped: SkippedFix[] = [];
  const allReportRows = [...summaryRows, ...addressMismatchRows, ...coordinateMismatchRows];
  const officialDupes = officialDuplicateNumbers(duplicateRows, officialRows);
  const duplicateResolution = buildDuplicateResolutionFromCurrentDb(
    currentDb,
    allReportRows,
    officialDupes,
  );

  const coordinateStoreNumbers = uniqueStoreNumbers([...summaryRows, ...coordinateMismatchRows]);
  const processedCoordinateDbIds = new Set<string>();

  for (const storeNumber of coordinateStoreNumbers) {
    const currentRows = getCurrentRowsForStoreNumber(currentDb, storeNumber);

    if (currentRows.length === 0) {
      skipped.push({
        storeNumber,
        dbId: "",
        skippedReason: "current_store_not_found",
        details: "Store number is not present in the connected database",
      });
      continue;
    }

    if (currentRows.length > 1) {
      const keeperId = resolveKeeperForDuplicateGroup(storeNumber, duplicateResolution);
      if (!keeperId) {
        for (const row of currentRows) {
          skipped.push({
            storeNumber,
            dbId: row.id,
            skippedReason: "current_store_duplicate_ambiguous",
            details: "Multiple DB rows share this store number in the current environment",
          });
        }
        continue;
      }

      const nonKeepers = currentRows.filter((row) => row.id.toUpperCase() !== keeperId.toUpperCase());
      for (const row of nonKeepers) {
        skipped.push({
          storeNumber,
          dbId: row.id,
          skippedReason: "current_store_duplicate_ambiguous",
          details: "Duplicate row is not the recommended keeper in the current environment",
        });
      }
    }

    const targetRows =
      currentRows.length === 1
        ? currentRows
        : currentRows.filter(
            (row) =>
              row.id.toUpperCase() ===
              resolveKeeperForDuplicateGroup(storeNumber, duplicateResolution)?.toUpperCase(),
          );

    for (const currentRow of targetRows) {
      if (processedCoordinateDbIds.has(currentRow.id.toUpperCase())) {
        continue;
      }
      processedCoordinateDbIds.add(currentRow.id.toUpperCase());

      const report = pickReportRowForStore(storeNumber, allReportRows, currentRow);
      if (!report) {
        continue;
      }

      if (report.geocodingStatus !== "OK") {
        skipped.push({
          storeNumber,
          dbId: currentRow.id,
          skippedReason: "geocoding_not_ok",
          details: report.geocodingErrorMessage || report.geocodingStatus,
        });
        continue;
      }

      if (!hasCoordinates(report.geocodedLatitude, report.geocodedLongitude)) {
        skipped.push({
          storeNumber,
          dbId: currentRow.id,
          skippedReason: "missing_geocoded_coordinates",
          details: "Geocoded latitude/longitude are required",
        });
        continue;
      }

      const drift = detectReportDrift(currentRow, report);
      const distance = recomputeCoordinateDistance(
        {
          ...currentRow,
          latitude: drift.currentLatitude,
          longitude: drift.currentLongitude,
        },
        report.geocodedLatitude,
        report.geocodedLongitude,
      );

      if (distance === null) {
        skipped.push({
          storeNumber,
          dbId: currentRow.id,
          skippedReason: "missing_distance",
          details: "Current DB coordinates are required to recompute distance",
        });
        continue;
      }

      const coordinateStatus = recomputeCoordinateStatus(distance);
      if (coordinateStatus === "ok") {
        skipped.push({
          storeNumber,
          dbId: currentRow.id,
          skippedReason: "current_coordinates_already_ok",
          details: `Recomputed distance to geocoded official address is ${distance.toFixed(2)} m`,
        });
        continue;
      }

      if (coordinateStatus === "review" && !options.includeReviewCoordinates) {
        proposed.push({
          storeNumber,
          dbId: currentRow.id,
          fixType: "REVIEW_COORDINATE_FIX",
          oldAddress: drift.currentAddress,
          newAddress: drift.currentAddress,
          oldLatitude: formatCoordinate(drift.currentLatitude),
          oldLongitude: formatCoordinate(drift.currentLongitude),
          newLatitude: report.geocodedLatitude,
          newLongitude: report.geocodedLongitude,
          distanceMeters: distance,
          confidence: "medium",
          applyByDefault: false,
          reason: appendNote(
            `Update coordinates from geocoded official address (${distance.toFixed(2)} m away)`,
            drift.notes,
          ),
          sqlComment: `store_number=${storeNumber} | REVIEW_COORDINATE_FIX | distance=${distance.toFixed(2)}m`,
        });
        continue;
      }

      if (coordinateStatus !== "mismatch" && coordinateStatus !== "review") {
        continue;
      }

      const classification = classifyCoordinateFix(distance, options.includeReviewCoordinates);
      proposed.push({
        storeNumber,
        dbId: currentRow.id,
        fixType: classification.fixType,
        oldAddress: drift.currentAddress,
        newAddress: drift.currentAddress,
        oldLatitude: formatCoordinate(drift.currentLatitude),
        oldLongitude: formatCoordinate(drift.currentLongitude),
        newLatitude: report.geocodedLatitude,
        newLongitude: report.geocodedLongitude,
        distanceMeters: distance,
        confidence: classification.confidence,
        applyByDefault: classification.applyByDefault,
        reason: appendNote(
          `Update coordinates from geocoded official address (${distance.toFixed(2)} m away)`,
          drift.notes,
        ),
        sqlComment: `store_number=${storeNumber} | ${classification.fixType} | distance=${distance.toFixed(2)}m`,
      });
    }
  }

  const addressStoreNumbers = uniqueStoreNumbers([...summaryRows, ...addressMismatchRows]);
  const processedAddressDbIds = new Set<string>();

  for (const storeNumber of addressStoreNumbers) {
    const currentRows = getCurrentRowsForStoreNumber(currentDb, storeNumber);
    if (currentRows.length !== 1) {
      if (currentRows.length > 1) {
        skipped.push({
          storeNumber,
          dbId: "",
          skippedReason: "current_store_duplicate_ambiguous",
          details: "Address update skipped for ambiguous duplicate group in current DB",
        });
      }
      continue;
    }

    const currentRow = currentRows[0];
    if (processedAddressDbIds.has(currentRow.id.toUpperCase())) {
      continue;
    }
    processedAddressDbIds.add(currentRow.id.toUpperCase());

    const report = pickReportRowForStore(storeNumber, allReportRows, currentRow);
    if (!report) {
      continue;
    }

    const drift = detectReportDrift(currentRow, report);
    const addressComparison = compareCurrentAddressToOfficial(
      drift.currentAddress,
      report.carrefourOfficialAddress,
    );

    if (addressComparison.status === "exact_match" || addressComparison.status === "likely_match") {
      skipped.push({
        storeNumber,
        dbId: currentRow.id,
        skippedReason: "current_address_already_ok",
        details: `Current DB address already matches official source (${addressComparison.status})`,
      });
      continue;
    }

    if (addressComparison.addressDifferenceReason === "range_or_format_difference") {
      skipped.push({
        storeNumber,
        dbId: currentRow.id,
        skippedReason: "range_or_format_difference",
        details: "Address difference is only formatting/range",
      });
      continue;
    }

    if (
      isLabelOnlyOfficialAddress(report.carrefourOfficialAddress) ||
      isMalformedOfficialAddress(report.carrefourOfficialAddress)
    ) {
      skipped.push({
        storeNumber,
        dbId: currentRow.id,
        skippedReason: "official_address_not_safe_to_apply",
        details: report.carrefourOfficialAddress,
      });
      continue;
    }

    if (officialDupes.has(storeNumber)) {
      skipped.push({
        storeNumber,
        dbId: currentRow.id,
        skippedReason: "official_duplicate_store_number",
        details: "Official source has duplicate store numbers",
      });
      continue;
    }

    proposed.push({
      storeNumber,
      dbId: currentRow.id,
      fixType: "AUTO_FIX_ADDRESS",
      oldAddress: drift.currentAddress,
      newAddress: report.carrefourOfficialAddress,
      oldLatitude: formatCoordinate(drift.currentLatitude),
      oldLongitude: formatCoordinate(drift.currentLongitude),
      newLatitude: formatCoordinate(drift.currentLatitude),
      newLongitude: formatCoordinate(drift.currentLongitude),
      distanceMeters: recomputeCoordinateDistance(
        currentRow,
        report.geocodedLatitude,
        report.geocodedLongitude,
      ),
      confidence: "medium",
      applyByDefault: false,
      reason: appendNote("Align DB address with Carrefour official source", drift.notes),
      sqlComment: `store_number=${storeNumber} | AUTO_FIX_ADDRESS`,
    });
  }

  const officialByNumber = new Map(officialRows.map((row) => [row.storeNumber, row]));
  const missingInserts: MissingInsertPlanRow[] = [];
  const missingRequiresCoordinates: MissingInsertPlanRow[] = [];

  for (const row of missingRows) {
    if (getCurrentRowsForStoreNumber(currentDb, row.storeNumber).length > 0) {
      skipped.push({
        storeNumber: row.storeNumber,
        dbId: "",
        skippedReason: "missing_store_already_exists_in_current_db",
        details: "Store number already exists in the connected database",
      });
      continue;
    }

    const official = officialByNumber.get(row.storeNumber);
    const officialAddress = official?.officialAddress || row.carrefourOfficialAddress;
    const geocodedFromSummary = pickReportRowForStore(row.storeNumber, summaryRows);

    const latitude = geocodedFromSummary?.geocodedLatitude ?? "";
    const longitude = geocodedFromSummary?.geocodedLongitude ?? "";
    const canInsert = hasCoordinates(latitude, longitude) && !isLabelOnlyOfficialAddress(officialAddress);

    const planRow: MissingInsertPlanRow = {
      storeNumber: row.storeNumber,
      officialAddress,
      neighborhood: official?.neighborhood ?? "",
      locality: official?.locality ?? "",
      latitude,
      longitude,
      canInsert,
      reason: canInsert
        ? "Ready to insert when --insert-missing is passed"
        : hasCoordinates(latitude, longitude)
          ? "Official address is not a physical address"
          : "Missing geocoded coordinates",
    };

    if (canInsert) {
      missingInserts.push(planRow);
      if (options.insertMissing) {
        proposed.push({
          storeNumber: row.storeNumber,
          dbId: "",
          fixType: "INSERT_MISSING",
          oldAddress: "",
          newAddress: officialAddress,
          oldLatitude: "",
          oldLongitude: "",
          newLatitude: latitude,
          newLongitude: longitude,
          distanceMeters: null,
          confidence: "medium",
          applyByDefault: false,
          reason: "Insert missing store from Carrefour official source",
          sqlComment: `store_number=${row.storeNumber} | INSERT_MISSING`,
        });
      }
    } else {
      missingRequiresCoordinates.push(planRow);
    }
  }

  for (const currentRow of currentDb.nonNumericStores) {
    const normalizedDbAddress = normalizeAddress(currentRow.address);
    const missingMatch = missingRows.find(
      (row) => normalizeAddress(row.carrefourOfficialAddress) === normalizedDbAddress,
    );

    if (!missingMatch) {
      continue;
    }

    if (getCurrentRowsForStoreNumber(currentDb, missingMatch.storeNumber).length > 0) {
      continue;
    }

    proposed.push({
      storeNumber: missingMatch.storeNumber,
      dbId: currentRow.id,
      fixType: "RENAME_NONNUMERIC",
      oldAddress: currentRow.address,
      newAddress: currentRow.address,
      oldLatitude: formatCoordinate(currentRow.latitude),
      oldLongitude: formatCoordinate(currentRow.longitude),
      newLatitude: "",
      newLongitude: "",
      distanceMeters: null,
      confidence: "medium",
      applyByDefault: false,
      reason: options.fixNonnumericNames
        ? `Rename non-numeric store '${currentRow.name}' to official store number ${missingMatch.storeNumber}`
        : `Possible non-numeric match '${currentRow.name}' for missing store ${missingMatch.storeNumber}`,
      sqlComment: `store_number=${missingMatch.storeNumber} | RENAME_NONNUMERIC | old_name=${currentRow.name}`,
    });

    if (!options.fixNonnumericNames) {
      skipped.push({
        storeNumber: missingMatch.storeNumber,
        dbId: currentRow.id,
        skippedReason: "possible_nonnumeric_match_requires_manual_or_flag",
        details: `Current DB row '${currentRow.name}' matches missing official address`,
      });
    }
  }

  for (const entry of duplicateResolution) {
    if (entry.recommendation !== "deactivate" || !entry.dbId) {
      continue;
    }

    if (officialDupes.has(entry.storeNumber)) {
      continue;
    }

    const currentRow = currentDb.stores.find((row) => row.id.toUpperCase() === entry.dbId.toUpperCase());
    if (!currentRow?.active) {
      continue;
    }

    const keeper = duplicateResolution.find(
      (row) => row.storeNumber === entry.storeNumber && row.recommendation === "keep",
    );
    const keeperDistance = parseNumber(keeper?.coordinateDistanceMeters ?? "");
    const entryDistance = parseNumber(entry.coordinateDistanceMeters ?? "");

    const highConfidence =
      keeper?.addressMatchStatus === "exact_match" ||
      (keeperDistance !== null && keeperDistance <= 100) ||
      (entryDistance !== null &&
        keeperDistance !== null &&
        entryDistance - keeperDistance > 1000);

    if (!highConfidence) {
      skipped.push({
        storeNumber: entry.storeNumber,
        dbId: entry.dbId,
        skippedReason: "ambiguous_duplicate_group",
        details: "Duplicate deactivation requires high confidence",
      });
      continue;
    }

    proposed.push({
      storeNumber: entry.storeNumber,
      dbId: entry.dbId,
      fixType: "DEACTIVATE_DUPLICATE",
      oldAddress: entry.address,
      newAddress: entry.address,
      oldLatitude: entry.latitude,
      oldLongitude: entry.longitude,
      newLatitude: entry.latitude,
      newLongitude: entry.longitude,
      distanceMeters: entryDistance,
      confidence: "high",
      applyByDefault: false,
      reason: "Deactivate duplicate DB row with worse coordinate/address match",
      sqlComment: `store_number=${entry.storeNumber} | DEACTIVATE_DUPLICATE`,
    });
  }

  const extraRows = summaryRows.filter((row) => row.status === "extra_in_database");
  for (const row of extraRows) {
    const currentRows = getCurrentRowsForStoreNumber(currentDb, row.storeNumber);
    const currentRow = currentRows[0];
    if (!currentRow || !options.deactivateExtra) {
      continue;
    }

    proposed.push({
      storeNumber: row.storeNumber,
      dbId: currentRow.id,
      fixType: "DEACTIVATE_EXTRA",
      oldAddress: currentRow.address,
      newAddress: currentRow.address,
      oldLatitude: formatCoordinate(currentRow.latitude),
      oldLongitude: formatCoordinate(currentRow.longitude),
      newLatitude: formatCoordinate(currentRow.latitude),
      newLongitude: formatCoordinate(currentRow.longitude),
      distanceMeters: null,
      confidence: "low",
      applyByDefault: false,
      reason: "Deactivate extra store not present in Carrefour official source",
      sqlComment: `store_number=${row.storeNumber} | DEACTIVATE_EXTRA`,
    });
  }

  const coordinateUpdates = proposed.filter((fix) =>
    ["AUTO_FIX_COORDINATE", "CRITICAL_COORDINATE_FIX", "REVIEW_COORDINATE_FIX"].includes(fix.fixType),
  );
  const addressUpdates = proposed.filter((fix) => fix.fixType === "AUTO_FIX_ADDRESS");

  return {
    proposed,
    skipped,
    duplicateResolution,
    missingInserts,
    missingRequiresCoordinates,
    environmentSnapshot,
    summary: {
      totalCoordinateUpdatesProposed: coordinateUpdates.length,
      totalAddressUpdatesProposed: addressUpdates.length,
      totalMissingInsertCandidates: missingInserts.length,
      totalDuplicateGroups: currentDb.duplicateNumericGroups.size,
      totalDuplicateDeactivationCandidates: proposed.filter(
        (fix) => fix.fixType === "DEACTIVATE_DUPLICATE",
      ).length,
      totalSkipped: skipped.length,
      totalApplyDefault: proposed.filter((fix) => fix.applyByDefault).length,
      generatedAt: new Date().toISOString(),
      nodeEnv: environmentSnapshot.nodeEnv,
      dbName: environmentSnapshot.dbName,
      dbHost: environmentSnapshot.dbHost,
    },
  };
};

export const selectFixesToApply = (
  plan: FixPlan,
  options: FixPlanOptions,
): ProposedFix[] =>
  plan.proposed.filter((fix) => {
    if (fix.applyByDefault) {
      return true;
    }

    if (fix.fixType === "AUTO_FIX_ADDRESS" && options.fixAddresses) {
      return true;
    }

    if (fix.fixType === "INSERT_MISSING" && options.insertMissing) {
      return true;
    }

    if (fix.fixType === "REVIEW_COORDINATE_FIX" && options.includeReviewCoordinates) {
      return true;
    }

    if (fix.fixType === "DEACTIVATE_DUPLICATE" && options.deactivateDuplicates) {
      return true;
    }

    if (fix.fixType === "RENAME_NONNUMERIC" && options.fixNonnumericNames) {
      return true;
    }

    if (fix.fixType === "DEACTIVATE_EXTRA" && options.deactivateExtra) {
      return true;
    }

    return false;
  });

export {
  isCommercialDescriptionAddress,
  isLabelOnlyOfficialAddress,
  isMalformedOfficialAddress,
} from "./address-heuristics";
