import { existsSync } from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

const loadEnvFile = (filePath: string): void => {
  if (existsSync(filePath)) {
    config({ path: filePath });
  }
};

export const loadProjectEnvFiles = (cwd = process.cwd()): void => {
  const roots = [cwd, join(cwd, "..")];

  for (const root of roots) {
    loadEnvFile(join(root, "backend", ".env"));
    loadEnvFile(join(root, ".env"));
    loadEnvFile(join(root, "frontend", ".env"));
  }
};

export const resolveGoogleMapsApiKey = (
  cwd = process.cwd(),
): { key: string | null; source: string | null } => {
  loadProjectEnvFiles(cwd);

  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (googleMapsApiKey) {
    return { key: googleMapsApiKey, source: "GOOGLE_MAPS_API_KEY" };
  }

  const viteGoogleMapsApiKey = process.env.VITE_GOOGLE_MAPS_API_KEY?.trim();
  if (viteGoogleMapsApiKey) {
    return { key: viteGoogleMapsApiKey, source: "VITE_GOOGLE_MAPS_API_KEY" };
  }

  return { key: null, source: null };
};
