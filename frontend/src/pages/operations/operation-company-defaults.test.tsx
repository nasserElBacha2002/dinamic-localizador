import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider, NumberInput } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import type { CompanySettings } from "../../types/company-settings";
import type { OperationFormValues } from "../../schemas/operation.schema";
import { buildOperationCreateDefaultValues } from "../../utils/operation-create-defaults";

function renderWithMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function createMockCompanySettings(
  overrides: Partial<CompanySettings> = {},
): CompanySettings {
  return {
    companyId: "company-1",
    operationTimezone: "America/Argentina/Buenos_Aires",
    defaultRadiusMeters: 150,
    lateGraceMinutes: 90,
    earlyLeaveToleranceMinutes: 30,
    requireCheckoutLocation: true,
    allowManualAttendanceCorrections: true,
    defaultEarlyArrivalToleranceMinutes: 15,
    defaultLateArrivalToleranceMinutes: 20,
    defaultOperationStartTime: "20:30",
    defaultOperationEndTime: "03:00",
    geofenceReviewMarginMeters: 30,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function OperationToleranceHarness({ defaultValues }: { defaultValues: OperationFormValues }) {
  return (
    <>
      <NumberInput
        label="Tolerancia temprana (minutos)"
        value={defaultValues.earlyToleranceMinutes}
        readOnly
      />
      <NumberInput
        label="Tolerancia tardía (minutos)"
        value={defaultValues.lateToleranceMinutes}
        readOnly
      />
    </>
  );
}

afterEach(() => {
  cleanup();
});

describe("buildOperationCreateDefaultValues", () => {
  it("uses inventory operation tolerances instead of WhatsApp tolerances", () => {
    const settings = createMockCompanySettings({
      defaultEarlyArrivalToleranceMinutes: 15,
      defaultLateArrivalToleranceMinutes: 20,
      lateGraceMinutes: 90,
      earlyLeaveToleranceMinutes: 30,
    });

    const defaults = buildOperationCreateDefaultValues(settings);

    assert.equal(defaults.earlyToleranceMinutes, 15);
    assert.equal(defaults.lateToleranceMinutes, 20);
    assert.notEqual(defaults.earlyToleranceMinutes, settings.lateGraceMinutes);
    assert.notEqual(defaults.lateToleranceMinutes, settings.earlyLeaveToleranceMinutes);
  });
});

describe("Operation create tolerance prefill", () => {
  it("renders prefilled tolerances from inventory operation settings", () => {
    const settings = createMockCompanySettings({
      defaultEarlyArrivalToleranceMinutes: 15,
      defaultLateArrivalToleranceMinutes: 20,
      lateGraceMinutes: 90,
      earlyLeaveToleranceMinutes: 30,
    });

    const view = renderWithMantine(
      <OperationToleranceHarness defaultValues={buildOperationCreateDefaultValues(settings)} />,
    );

    const earlyInput = view.getByLabelText("Tolerancia temprana (minutos)") as HTMLInputElement;
    const lateInput = view.getByLabelText("Tolerancia tardía (minutos)") as HTMLInputElement;

    assert.equal(earlyInput.value, "15");
    assert.equal(lateInput.value, "20");
    assert.notEqual(earlyInput.value, "90");
    assert.notEqual(lateInput.value, "30");
    assert.notEqual(earlyInput.value, "60");
    assert.notEqual(lateInput.value, "90");
  });
});

describe("OperationImportPage defaults banner", () => {
  it("mentions inventory configuration explicitly", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const pageFile = readFileSync(
      join(process.cwd(), "src/pages/operations/OperationImportPage.tsx"),
      "utf8",
    );

    assert.ok(pageFile.includes("configuración de inventarios"));
  });
});
