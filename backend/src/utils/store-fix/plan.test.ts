import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCurrentDbState } from "./current-db";
import {
  buildFixPlan,
  isCommercialDescriptionAddress,
  isLabelOnlyOfficialAddress,
  isMalformedOfficialAddress,
  selectFixesToApply,
} from "./plan";
import type { CurrentDbStore, EnvironmentSnapshot, FixPlanOptions } from "./types";

const defaultOptions: FixPlanOptions = {
  includeReviewCoordinates: false,
  fixAddresses: false,
  insertMissing: false,
  deactivateDuplicates: false,
  deactivateExtra: false,
  fixNonnumericNames: false,
};

const environmentSnapshot: EnvironmentSnapshot = {
  nodeEnv: "test",
  dbHost: "localhost",
  dbPort: 1433,
  dbName: "test_db",
  dbUser: "test_user",
  tableName: "operational_locations",
  totalCurrentDbRows: 2,
  totalNumericCurrentDbStores: 2,
  totalNonNumericCurrentDbRows: 0,
  duplicateNumericStoreGroups: 0,
  generatedAt: "2026-01-01T00:00:00.000Z",
};

const makeStore = (input: {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
}): CurrentDbStore => ({
  id: input.id,
  name: input.name,
  address: input.address,
  latitude: input.latitude,
  longitude: input.longitude,
  allowedRadiusMeters: 150,
  active: true,
  createdAt: "",
  updatedAt: "",
  googlePlaceId: null,
  neighborhood: null,
  locality: null,
  storeFormat: null,
});

describe("address heuristics", () => {
  it("detects commercial description addresses", () => {
    assert.equal(isCommercialDescriptionAddress("Market Vicente Lopez"), true);
    assert.equal(isCommercialDescriptionAddress("226 - Market Edison"), true);
    assert.equal(isCommercialDescriptionAddress("Av. Maipú 940"), false);
  });

  it("detects malformed official addresses", () => {
    assert.equal(isMalformedOfficialAddress("226 - Market Edison"), true);
    assert.equal(isMalformedOfficialAddress("25 de Mayo 2650"), false);
  });

  it("detects label-only official addresses", () => {
    assert.equal(isLabelOnlyOfficialAddress("Market Bahía Blanca"), true);
    assert.equal(isLabelOnlyOfficialAddress("Av. Rivadavia 8421"), false);
  });
});

describe("buildFixPlan", () => {
  it("proposes coordinate fixes only for recomputed distances above 300m by default", () => {
    const currentDb = buildCurrentDbState([
      makeStore({
        id: "851ECED6-44D9-456C-87BA-CC76DBD81014",
        name: "163",
        address: "San Jerónimo 444",
        latitude: -31.388647,
        longitude: -64.1341066,
      }),
      makeStore({
        id: "90235E39-0F5B-4EBA-99CB-278716CE78B5",
        name: "194",
        address: "Jacinto de Altolaguirre 1679",
        latitude: -31.388647,
        longitude: -64.1341066,
      }),
    ]);

    const plan = buildFixPlan(
      [
        {
          storeNumber: "163",
          status: "matched",
          carrefourOfficialAddress: "San Jerónimo 444",
          dbAddress: "San Jerónimo 444",
          addressMatchStatus: "exact_match",
          addressSimilarity: "1",
          normalizedOfficialAddress: "",
          normalizedDbAddress: "",
          addressDifferenceReason: "range_or_format_difference",
          dbLatitude: "-32.3554010",
          dbLongitude: "-60.9408085",
          geocodedLatitude: "-31.3846470",
          geocodedLongitude: "-64.1341066",
          coordinateDistanceMeters: "450.50",
          coordinateStatus: "mismatch",
          geocodingStatus: "OK",
          geocodingErrorCode: "",
          geocodingErrorMessage: "",
          geocodingQuery: "query",
          dbId: "00000000-0000-0000-0000-000000000001",
          notes: "",
        },
        {
          storeNumber: "194",
          status: "matched",
          carrefourOfficialAddress: "Jacinto de Altolaguirre 1679",
          dbAddress: "Jacinto de Altolaguirre 1679",
          addressMatchStatus: "exact_match",
          addressSimilarity: "1",
          normalizedOfficialAddress: "",
          normalizedDbAddress: "",
          addressDifferenceReason: "range_or_format_difference",
          dbLatitude: "-31.3886470",
          dbLongitude: "-64.1341066",
          geocodedLatitude: "-31.3895376",
          geocodedLongitude: "-64.134368",
          coordinateDistanceMeters: "102.09",
          coordinateStatus: "review",
          geocodingStatus: "OK",
          geocodingErrorCode: "",
          geocodingErrorMessage: "",
          geocodingQuery: "query",
          dbId: "00000000-0000-0000-0000-000000000002",
          notes: "",
        },
      ],
      [],
      [],
      [],
      [],
      [],
      currentDb,
      environmentSnapshot,
      defaultOptions,
    );

    const autoFixes = plan.proposed.filter((fix) => fix.fixType === "AUTO_FIX_COORDINATE");
    const reviewFixes = plan.proposed.filter((fix) => fix.fixType === "REVIEW_COORDINATE_FIX");

    assert.equal(autoFixes.length, 1);
    assert.equal(autoFixes[0]?.storeNumber, "163");
    assert.equal(autoFixes[0]?.dbId, "851ECED6-44D9-456C-87BA-CC76DBD81014");
    assert.equal(autoFixes[0]?.applyByDefault, true);
    assert.equal(reviewFixes.length, 1);
    assert.equal(reviewFixes[0]?.applyByDefault, false);
  });

  it("skips fixes when the store is missing in the current database", () => {
    const currentDb = buildCurrentDbState([]);

    const plan = buildFixPlan(
      [
        {
          storeNumber: "163",
          status: "matched",
          carrefourOfficialAddress: "San Jerónimo 444",
          dbAddress: "San Jerónimo 444",
          addressMatchStatus: "exact_match",
          addressSimilarity: "1",
          normalizedOfficialAddress: "",
          normalizedDbAddress: "",
          addressDifferenceReason: "",
          dbLatitude: "-32.3554010",
          dbLongitude: "-60.9408085",
          geocodedLatitude: "-31.4189504",
          geocodedLongitude: "-64.1787105",
          coordinateDistanceMeters: "450.50",
          coordinateStatus: "mismatch",
          geocodingStatus: "OK",
          geocodingErrorCode: "",
          geocodingErrorMessage: "",
          geocodingQuery: "query",
          dbId: "851ECED6-44D9-456C-87BA-CC76DBD81014",
          notes: "",
        },
      ],
      [],
      [],
      [],
      [],
      [],
      currentDb,
      environmentSnapshot,
      defaultOptions,
    );

    assert.equal(plan.proposed.length, 0);
    assert.equal(plan.skipped[0]?.skippedReason, "current_store_not_found");
  });

  it("does not auto-apply address fixes without --fix-addresses", () => {
    const currentDb = buildCurrentDbState([
      makeStore({
        id: "0575D83D-E480-4C10-A8E6-B3DC5A6693F8",
        name: "171",
        address: "Av. del Bicentenario de la Batalla de Salta 702",
        latitude: -24.7806159,
        longitude: -65.4019909,
      }),
    ]);

    const plan = buildFixPlan(
      [
        {
          storeNumber: "171",
          status: "matched",
          carrefourOfficialAddress: "Virrey Toledo 702",
          dbAddress: "Av. del Bicentenario de la Batalla de Salta 702",
          addressMatchStatus: "mismatch",
          addressSimilarity: "0.26",
          normalizedOfficialAddress: "",
          normalizedDbAddress: "",
          addressDifferenceReason: "substantive_difference",
          dbLatitude: "-24.7806159",
          dbLongitude: "-65.4019909",
          geocodedLatitude: "-24.7810414",
          geocodedLongitude: "-65.4026085",
          coordinateDistanceMeters: "78.27",
          coordinateStatus: "ok",
          geocodingStatus: "OK",
          geocodingErrorCode: "",
          geocodingErrorMessage: "",
          geocodingQuery: "query",
          dbId: "0575D83D-E480-4C10-A8E6-B3DC5A6693F8",
          notes: "",
        },
      ],
      [],
      [],
      [],
      [],
      [],
      currentDb,
      environmentSnapshot,
      defaultOptions,
    );

    const selected = selectFixesToApply(plan, defaultOptions);
    assert.equal(plan.proposed.some((fix) => fix.fixType === "AUTO_FIX_ADDRESS"), true);
    assert.equal(selected.some((fix) => fix.fixType === "AUTO_FIX_ADDRESS"), false);
  });
});
