export function isDin506GateEnabled(): boolean {
  return process.env.DIN506_GATE === "1";
}

export function requireDistOrGate(distExists: boolean, label: string): void | "skip" {
  if (distExists) {
    return;
  }
  if (isDin506GateEnabled()) {
    throw new Error(`${label}: dist/ requerido (ejecutar npm run build antes del gate DIN-506).`);
  }
  return "skip";
}

export async function requireDockerOrGate(dockerAvailable: boolean, label: string): Promise<void | "skip"> {
  if (dockerAvailable) {
    return;
  }
  if (isDin506GateEnabled()) {
    throw new Error(`${label}: Docker requerido para el gate DIN-506.`);
  }
  return "skip";
}