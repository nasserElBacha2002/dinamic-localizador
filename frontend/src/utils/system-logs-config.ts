export function isSystemLogsUiEnabled(): boolean {
  const viteEnv = (import.meta as { env?: ImportMetaEnv }).env;
  const raw = viteEnv?.VITE_SYSTEM_LOGS_UI_ENABLED;
  if (raw === undefined || raw === "") {
    return true;
  }
  return raw !== "false" && raw !== "0";
}
