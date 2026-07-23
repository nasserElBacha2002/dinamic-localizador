import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../errors/app-error";
import { decodeImportBase64, parseImportFile } from "../imports/parse-import-file";
import { servicesImportStrategy } from "../imports/strategies/services.strategy";

describe("decodeImportBase64", () => {
  it("decodes valid padded base64", () => {
    const buffer = decodeImportBase64(Buffer.from("hola", "utf8").toString("base64"));
    assert.equal(buffer.toString("utf8"), "hola");
  });

  it("rejects invalid characters without relying on Buffer throw", () => {
    assert.throws(
      () => decodeImportBase64("@@@"),
      (error: unknown) => error instanceof AppError && error.code === "IMPORT_INVALID_FILE",
    );
  });

  it("rejects bad padding", () => {
    assert.throws(
      () => decodeImportBase64("YQ==="),
      (error: unknown) => error instanceof AppError && error.code === "IMPORT_INVALID_FILE",
    );
  });
});

describe("strategy maxRows", () => {
  it("honors a strategy maxRows below the default", async () => {
    const previous = servicesImportStrategy.maxRows;
    servicesImportStrategy.maxRows = 1;
    try {
      const csv = [
        "Nombre,Dirección,Barrio,Localidad,Formato,Latitud,Longitud,Radio (metros),Google Place ID",
        "A,,,,,-34.6,-58.4,150,",
        "B,,,,,-34.6,-58.4,150,",
      ].join("\n");

      await assert.rejects(
        () =>
          servicesImportStrategy.prepare(
            "00000000-0000-0000-0000-000000000001",
            Buffer.from(csv, "utf8"),
            "s.csv",
          ),
        (error: unknown) => error instanceof AppError && error.code === "IMPORT_TOO_MANY_ROWS",
      );
    } finally {
      servicesImportStrategy.maxRows = previous;
    }
  });

  it("parseImportFile enforces custom maxRows", () => {
    const csv = "A,B\n1,2\n3,4\n";
    assert.throws(
      () => parseImportFile(Buffer.from(csv, "utf8"), "x.csv", { maxRows: 1 }),
      (error: unknown) => error instanceof AppError && error.code === "IMPORT_TOO_MANY_ROWS",
    );
  });
});
