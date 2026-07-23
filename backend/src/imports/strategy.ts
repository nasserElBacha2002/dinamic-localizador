import type { CompanyModuleKey } from "../constants/company-modules";
import type { CompanyPermission } from "../types/company";
import type { ImportEntityType } from "./constants";
import type { PreparedImport } from "./prepared-import";
import type {
  ImportExecuteResult,
  ImportPreviewResult,
  ImportTemplate,
} from "./types";

export interface ImportPersistContext {
  userId?: string | null;
  importJobId?: string | null;
  /** When true, re-check DB uniqueness for still-valid rows before write. */
  revalidateConcurrency?: boolean;
}

export interface ImportStrategy {
  entityType: ImportEntityType;
  permission: CompanyPermission;
  moduleKeys: readonly CompanyModuleKey[];
  requireAllRowsValid: boolean;
  maxRows: number;
  strategyVersion: string;
  buildTemplate(): ImportTemplate;
  prepare(
    companyId: string,
    buffer: Buffer,
    fileName: string,
  ): Promise<PreparedImport>;
  persist(
    companyId: string,
    prepared: PreparedImport,
    context?: ImportPersistContext,
  ): Promise<ImportExecuteResult>;
  /** Convenience wrappers used by tests and adapters. */
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
