export {};

declare global {
  // Populated by src/test/setup-vite-env.mjs during Node component tests.
  var __VITE_API_URL__: string | undefined;
}
