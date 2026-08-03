export function isWhatsappObservabilityUiEnabled(): boolean {
  const viteEnv = (import.meta as { env?: ImportMetaEnv }).env;
  const raw = viteEnv?.VITE_WHATSAPP_OBSERVABILITY_UI_ENABLED;
  if (raw === undefined || raw === "") {
    return true;
  }
  return raw !== "false" && raw !== "0";
}
