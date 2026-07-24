import { Window } from "happy-dom";
import React from "react";

export function setupDomEnvironment(): void {
  const window = new Window({ url: "http://localhost/" });
  const document = window.document;

  Object.defineProperty(globalThis, "React", {
    configurable: true,
    writable: true,
    value: React,
  });

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    writable: true,
    value: window,
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    writable: true,
    value: document,
  });
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    writable: true,
    value: window.navigator,
  });
  Object.defineProperty(globalThis, "HTMLElement", {
    configurable: true,
    writable: true,
    value: window.HTMLElement,
  });
  Object.defineProperty(globalThis, "Element", {
    configurable: true,
    writable: true,
    value: window.Element,
  });
  Object.defineProperty(globalThis, "Node", {
    configurable: true,
    writable: true,
    value: window.Node,
  });
  Object.defineProperty(globalThis, "Document", {
    configurable: true,
    writable: true,
    value: window.Document,
  });
  Object.defineProperty(globalThis, "DocumentFragment", {
    configurable: true,
    writable: true,
    value: window.DocumentFragment,
  });
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    writable: true,
    value: window.getComputedStyle.bind(window),
  });

  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    writable: true,
    value: window.localStorage,
  });

  if (!globalThis.ResizeObserver) {
    Object.defineProperty(globalThis, "ResizeObserver", {
      configurable: true,
      writable: true,
      value: class ResizeObserver {
        observe(): void {}
        unobserve(): void {}
        disconnect(): void {}
      },
    });
  }

  if (!("ShadowRoot" in globalThis) && "ShadowRoot" in window) {
    Object.defineProperty(globalThis, "ShadowRoot", {
      configurable: true,
      writable: true,
      value: window.ShadowRoot,
    });
  }

  if (!globalThis.MutationObserver && "MutationObserver" in window) {
    Object.defineProperty(globalThis, "MutationObserver", {
      configurable: true,
      writable: true,
      value: window.MutationObserver,
    });
  }

  if (!globalThis.MutationObserver) {
    Object.defineProperty(globalThis, "MutationObserver", {
      configurable: true,
      writable: true,
      value: class MutationObserver {
        observe(): void {}
        disconnect(): void {}
        takeRecords(): MutationRecord[] {
          return [];
        }
      },
    });
  }

  if (!globalThis.requestAnimationFrame) {
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => {
        const handle = setTimeout(() => callback(Date.now()), 0);
        // Floating UI autoUpdate can leave RAF loops after unmount; unref so Node's
        // test runner is not kept alive by happy-dom timer polyfills.
        if (typeof handle === "object" && handle && "unref" in handle) {
          (handle as NodeJS.Timeout).unref();
        }
        return handle as unknown as number;
      },
    });
  }

  if (!globalThis.cancelAnimationFrame) {
    Object.defineProperty(globalThis, "cancelAnimationFrame", {
      configurable: true,
      writable: true,
      value: (handle: number) => clearTimeout(handle),
    });
  }
}
