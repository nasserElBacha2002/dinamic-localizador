/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OPERATIONS_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
