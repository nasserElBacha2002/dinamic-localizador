import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  scanCodeLine,
  scanIdentifier,
  scanPackageJson,
  scanPath,
} from "./domain-terminology-scanner";

describe("domain terminology scanner", () => {
  it("detects legacy inventory terms inside identifiers", () => {
    const samples = [
      "InventoryRecord",
      "inventoryId",
      "inventory_id",
      "INVENTORY_NOT_FOUND",
      "findByInventory",
      "inventoryOptions",
    ];

    for (const sample of samples) {
      assert.ok(scanIdentifier(sample), `expected violation for ${sample}`);
    }
  });

  it("detects legacy store terms inside identifiers", () => {
    const samples = [
      "StoreService",
      "storeId",
      "store_name",
      "storeFormat",
      "STORE_INACTIVE",
    ];

    for (const sample of samples) {
      assert.ok(scanIdentifier(sample), `expected violation for ${sample}`);
    }
  });

  it("detects Spanish copy violations", () => {
    const violations = scanCodeLine(
      "frontend/src/pages/example.tsx",
      10,
      'throw new Error("Inventario no encontrado");',
    );
    assert.ok(violations.some((violation) => violation.category === "CONTENT_COPY"));

    const storeCopy = scanCodeLine(
      "frontend/src/pages/example.tsx",
      11,
      'return "Seleccioná una tienda";',
    );
    assert.ok(storeCopy.some((violation) => violation.matchedToken === "tienda"));
  });

  it("allows Mantine combobox store prop via exact allowlist pattern", () => {
    const line = "      store={combobox.store}";
    const violations = scanCodeLine(
      "frontend/src/design-system/filters/FilterLookupInput.tsx",
      42,
      line,
    );
    assert.ok(violations.length > 0);
    const allowed = /store=\{/.test(line);
    assert.equal(allowed, true);
  });

  it("detects legacy npm script names in package.json", () => {
    const violations = scanPackageJson(
      "backend/package.json",
      JSON.stringify({
        scripts: {
          "seed:stores": "tsx src/scripts/seed-services.ts",
          "reconcile:stores": "tsx src/scripts/reconcile-services.ts",
        },
      }),
    );

    assert.ok(violations.some((violation) => violation.text.includes("seed:stores")));
    assert.ok(violations.some((violation) => violation.text.includes("reconcile:stores")));
  });

  it("detects forbidden legacy path segments", () => {
    const violation = scanPath("backend/src/utils/store-fix/plan.ts");
    assert.ok(violation);
    assert.equal(violation?.category, "PATH_NAME");
  });

  it("does not flag restore as a store-domain identifier", () => {
    assert.equal(scanIdentifier("restore"), null);
    assert.equal(scanIdentifier("localStorage"), null);
  });
});
