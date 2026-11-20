import type { DemoRequestValues } from "./DemoRequestForm.types";

export type DemoRequestSubmitResult = {
  message: string;
  delivered: boolean;
};

const DEMO_REQUEST_SUCCESS_PREFIX = "Recibimos tu solicitud";

function isAcceptedDemoResponse(data: DemoRequestSubmitResult | undefined): data is DemoRequestSubmitResult {
  if (!data?.message) {
    return false;
  }
  if (data.delivered === true) {
    return true;
  }
  return data.delivered === false && data.message.startsWith(DEMO_REQUEST_SUCCESS_PREFIX);
}

export type DemoRequestApiError = {
  code?: string;
  message: string;
};

function resolveApiBaseUrl(): string | null {
  const viteEnv = (import.meta as { env?: { VITE_API_URL?: string } }).env;
  const fromMeta = viteEnv?.VITE_API_URL?.trim();
  const fromGlobal = (globalThis as { __VITE_API_URL__?: string }).__VITE_API_URL__?.trim();
  return fromMeta || fromGlobal || null;
}

export function isDemoSubmitEnabled(): boolean {
  return Boolean(resolveApiBaseUrl());
}

function joinApiUrl(path: string): string {
  const base = resolveApiBaseUrl();
  if (!base) {
    throw new Error("VITE_API_URL no está configurada");
  }
  const normalized = base.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${normalized}${suffix}`;
}

export async function submitDemoRequest(
  values: DemoRequestValues & { companyWebsite: string },
): Promise<DemoRequestSubmitResult> {
  const response = await fetch(joinApiUrl("/marketing/demo-requests"), {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(values),
  });

  const payload = (await response.json().catch(() => null)) as
    | { data?: DemoRequestSubmitResult; error?: DemoRequestApiError }
    | null;

  if (!response.ok) {
    const message =
      payload?.error?.message ??
      "No pudimos enviar tu solicitud. Probá de nuevo en unos minutos.";
    const error = new Error(message) as Error & { code?: string; status?: number };
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }

  if (!isAcceptedDemoResponse(payload?.data)) {
    throw new Error("No pudimos confirmar el envío de tu solicitud.");
  }

  return payload.data;
}