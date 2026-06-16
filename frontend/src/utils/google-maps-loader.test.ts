import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resetGoogleMapsLoaderForTests } from "./google-maps-loader";

describe("google maps loader reset", () => {
  it("removes bootstrap script marker when reset", () => {
    const scripts: Array<{ id: string; parentNode: { removeChild: (node: { id: string }) => void } }> = [];
    const parentNode = {
      removeChild(node: { id: string }) {
        const index = scripts.indexOf(node);
        if (index >= 0) {
          scripts.splice(index, 1);
        }
      },
    };

    const documentMock = {
      getElementById: (id: string) => scripts.find((script) => script.id === id) ?? null,
      createElement: () => ({ id: "", textContent: "" }),
      head: {
        appendChild: (node: { id: string }) => {
          scripts.push({ ...node, parentNode });
        },
      },
    } as unknown as Document;

    const previousDocument = globalThis.document;
    Object.defineProperty(globalThis, "document", {
      configurable: true,
      value: documentMock,
    });

    try {
      scripts.push({ id: "dinamic-google-maps-bootstrap", parentNode });
      resetGoogleMapsLoaderForTests();
      assert.equal(scripts.length, 0);
    } finally {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: previousDocument,
      });
    }
  });
});
