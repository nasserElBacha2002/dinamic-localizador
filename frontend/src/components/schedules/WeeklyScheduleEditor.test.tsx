import { setupDomEnvironment } from "../../test/setup-dom";

setupDomEnvironment();

import assert from "node:assert/strict";
import { MantineProvider } from "@mantine/core";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, it } from "node:test";
import React from "react";
import { WeeklyScheduleEditor } from "./WeeklyScheduleEditor";
import { createDefaultWeeklySchedule, WEEKDAY_LABELS_ES } from "../../types/schedule";

afterEach(() => {
  cleanup();
});

describe("WeeklyScheduleEditor", () => {
  it("renders seven Spanish weekdays", () => {
    const view = render(
      <MantineProvider>
        <WeeklyScheduleEditor
          value={createDefaultWeeklySchedule()}
          onChange={() => {}}
        />
      </MantineProvider>,
    );

    for (const label of Object.values(WEEKDAY_LABELS_ES)) {
      assert.ok(view.getByText(label));
    }
  });

  it("shows overnight hint for cross-midnight schedules", () => {
    const value = createDefaultWeeklySchedule();
    value[0] = {
      dayOfWeek: "MONDAY",
      isEnabled: true,
      startTime: "22:00",
      endTime: "06:00",
    };

    const view = render(
      <MantineProvider>
        <WeeklyScheduleEditor value={value} onChange={() => {}} />
      </MantineProvider>,
    );

    assert.ok(view.getByText("Finaliza al día siguiente"));
  });

  it("updates enabled state through checkbox", () => {
    let current = createDefaultWeeklySchedule();

    const view = render(
      <MantineProvider>
        <WeeklyScheduleEditor
          value={current}
          onChange={(next) => {
            current = next;
          }}
        />
      </MantineProvider>,
    );

    fireEvent.click(view.getByLabelText("Sábado"));
    const saturday = current.find((day) => day.dayOfWeek === "SATURDAY");
    assert.equal(saturday?.isEnabled, true);
    assert.equal(saturday?.startTime, "09:00");
  });
});
