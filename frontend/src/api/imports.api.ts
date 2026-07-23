import type {
  ImportEntityType,
  ImportExecuteResult,
  ImportFilePayload,
  ImportPreviewResult,
} from "../types/import";
import { scopedApiClient } from "./scoped-client";

export async function downloadImportTemplate(entityType: ImportEntityType): Promise<Blob> {
  const { data } = await scopedApiClient.get<Blob>(`imports/${entityType}/template`, {
    responseType: "blob",
  });
  return data;
}

export async function previewImport(
  entityType: ImportEntityType,
  payload: ImportFilePayload,
): Promise<ImportPreviewResult> {
  const { data } = await scopedApiClient.post<{ data: ImportPreviewResult }>(
    `imports/${entityType}/preview`,
    payload,
    { timeout: 60_000 },
  );
  return data.data;
}

export async function executeImport(
  entityType: ImportEntityType,
  payload: ImportFilePayload,
): Promise<ImportExecuteResult> {
  const { data } = await scopedApiClient.post<{ data: ImportExecuteResult }>(
    `imports/${entityType}/execute`,
    payload,
    { timeout: 120_000 },
  );
  return data.data;
}
