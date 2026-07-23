import type { CompanyModuleKey } from "../constants/company-modules";
import type { CompanyPermission } from "../types/company";
import type { ImportEntityType } from "./constants";
import type {
  ImportExecuteResult,
  ImportPreviewResult,
  ImportTemplate,
} from "./types";

export interface ImportStrategy {
  entityType: ImportEntityType;
  permission: CompanyPermission;
  moduleKeys: readonly CompanyModuleKey[];
  requireAllRowsValid: boolean;
  maxRows: number;
  buildTemplate(): ImportTemplate;
  preview(
    companyId: string,
    buffer: Buffer,
    fileName: string,
  ): Promise<ImportPreviewResult>;
  execute(
    companyId: string,
    buffer: Buffer,
    fileName: string,
    userId?: string | null,
  ): Promise<ImportExecuteResult>;
}
