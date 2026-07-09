import assert from "node:assert/strict";
import { describe, it } from "node:test";
import axios from "axios";
import { getApiErrorMessage, parseApiError } from "./errors";

/**
 * Mirrors ServiceCreatePage / ServiceEditPage error handling:
 * apiClient interceptor rejects with parseApiError(error),
 * then the page calls getApiErrorMessage(error) into errorMessage.
 */
describe("service create/edit duplicate name error path", () => {
  it("surfaces SERVICE_NAME_ALREADY_EXISTS business message from a 409 API response", () => {
    const axiosError = new axios.AxiosError(
      "Request failed",
      "ERR_BAD_REQUEST",
      undefined,
      undefined,
      {
        status: 409,
        data: {
          error: {
            code: "SERVICE_NAME_ALREADY_EXISTS",
            message: "Ya existe un servicio con este nombre en la compañía.",
          },
        },
        statusText: "Conflict",
        headers: {},
        config: {} as never,
      },
    );

    const parsed = parseApiError(axiosError);
    assert.equal(parsed.code, "SERVICE_NAME_ALREADY_EXISTS");
    assert.equal(parsed.status, 409);
    assert.equal(
      getApiErrorMessage(parsed),
      "Ya existe un servicio con este nombre en la compañía.",
    );
    assert.notEqual(getApiErrorMessage(parsed), "Ocurrió un error inesperado");
    assert.notEqual(getApiErrorMessage(parsed), "Error al guardar");
  });
});
