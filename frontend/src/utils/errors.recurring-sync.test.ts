import assert from "node:assert/strict";
import { describe, it } from "node:test";
import axios from "axios";
import { ApiError, isRecurringWorkdaySyncError, parseApiError } from "./errors";

describe("errors recurring sync mapping", () => {
  it("detects RECURRING_WORKDAY_SYNC_FAILED from ApiError", () => {
    const error = new ApiError(
      "La configuración se guardó, pero las jornadas no pudieron actualizarse completamente.",
      "RECURRING_WORKDAY_SYNC_FAILED",
      503,
    );
    assert.equal(isRecurringWorkdaySyncError(error), true);
  });

  it("parses axios sync failure responses", () => {
    const axiosError = new axios.AxiosError(
      "Request failed",
      "ERR_BAD_RESPONSE",
      undefined,
      undefined,
      {
        status: 503,
        data: {
          error: {
            code: "RECURRING_WORKDAY_SYNC_FAILED",
            message:
              "La configuración se guardó, pero no se pudieron actualizar las jornadas programadas.",
          },
        },
        statusText: "Service Unavailable",
        headers: {},
        config: {} as never,
      },
    );

    const parsed = parseApiError(axiosError);
    assert.equal(parsed.code, "RECURRING_WORKDAY_SYNC_FAILED");
    assert.equal(isRecurringWorkdaySyncError(parsed), true);
  });
});
