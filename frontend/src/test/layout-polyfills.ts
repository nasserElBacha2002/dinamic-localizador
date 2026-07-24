/** Floating UI / Mantine Menu need layout geometry in happy-dom. */
export function installLayoutPolyfills(): void {
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 40,
    right: 120,
    width: 120,
    height: 40,
    toJSON: () => ({}),
  };
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => rect,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => 40,
  });
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    get: () => 120,
  });
}
