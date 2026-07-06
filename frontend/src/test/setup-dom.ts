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
  Object.defineProperty(globalThis, "getComputedStyle", {
    configurable: true,
    writable: true,
    value: window.getComputedStyle.bind(window),
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

  if (!globalThis.requestAnimationFrame) {
    Object.defineProperty(globalThis, "requestAnimationFrame", {
      configurable: true,
      writable: true,
      value: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0),
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
