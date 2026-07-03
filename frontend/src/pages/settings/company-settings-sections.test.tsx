import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React, { useState } from "react";
import type { CompanySettingsFormValues } from "../../types/company-settings";
import { toCompanySettingsFormValues } from "../../utils/company-settings-validation";
import {
  CompanyAttendanceWhatsAppSettingsSection,
  CompanyInventoryOperationSettingsSection,
} from "./company-settings-form-sections";

function renderWithMantine(ui: React.ReactElement) {
  return render(<MantineProvider>{ui}</MantineProvider>);
}

function SettingsSectionsHarness({
  initialValues,
}: {
  initialValues: CompanySettingsFormValues;
}) {
  const [formValues, setFormValues] = useState(initialValues);

  return (
    <>
      <CompanyInventoryOperationSettingsSection
        formValues={formValues}
        setFormValues={setFormValues}
        disabled={false}
      />
      <CompanyAttendanceWhatsAppSettingsSection
        formValues={formValues}
        setFormValues={setFormValues}
        disabled={false}
      />
    </>
  );
}

afterEach(() => {
  cleanup();
});

describe("Company settings inventory vs WhatsApp sections", () => {
  it("shows inventory and WhatsApp tolerances in separate labeled sections", () => {
    const formValues = toCompanySettingsFormValues({
      operationTimezone: "America/Argentina/Buenos_Aires",
      defaultRadiusMeters: 150,
      lateGraceMinutes: 15,
      earlyLeaveToleranceMinutes: 30,
      requireCheckoutLocation: true,
      allowManualAttendanceCorrections: true,
      defaultEarlyArrivalToleranceMinutes: 60,
      defaultLateArrivalToleranceMinutes: 20,
      defaultOperationStartTime: "20:30",
      defaultOperationEndTime: "03:00",
    });

    const view = renderWithMantine(<SettingsSectionsHarness initialValues={formValues} />);

    assert.ok(view.getByText("Configuración de inventarios / operaciones"));
    assert.ok(view.getByText("Configuración de asistencia / WhatsApp"));
    assert.ok(view.getByLabelText("Tolerancia de llegada tardía para operaciones (min)"));
    assert.ok(view.getByLabelText("Tolerancia de puntualidad WhatsApp (min)"));

    const inventoryLateInput = view.getByLabelText(
      "Tolerancia de llegada tardía para operaciones (min)",
    ) as HTMLInputElement;
    const whatsappPunctualityInput = view.getByLabelText(
      "Tolerancia de puntualidad WhatsApp (min)",
    ) as HTMLInputElement;

    assert.equal(inventoryLateInput.value, "20");
    assert.equal(whatsappPunctualityInput.value, "15");
    assert.notEqual(inventoryLateInput.value, whatsappPunctualityInput.value);
  });
});
