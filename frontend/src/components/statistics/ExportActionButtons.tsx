import { Button, Group, Menu } from "@mantine/core";
import { useState } from "react";
import { useCompanyPermissions } from "../../hooks/useCompanyUsers";
import { buildExportFilename, exportToCsv, exportToXlsx } from "../../utils/export";
import { hasPermission } from "../../utils/permissions";

type ExportRow = Array<string | number | null | undefined>;

export interface ExportActionTarget {
  label: string;
  baseName: string;
  headers: string[];
  rows?: ExportRow[];
  loadRows?: () => Promise<ExportRow[]>;
  sheetName?: string;
}

interface ExportActionButtonsProps {
  /** Single-target export (legacy). Ignored when `targets` is provided. */
  baseName?: string;
  headers?: string[];
  rows?: ExportRow[];
  loadRows?: () => Promise<ExportRow[]>;
  dateFrom?: string;
  dateTo?: string;
  size?: "small" | "medium";
  sheetName?: string;
  disabled?: boolean;
  /** Multi-target export: one CSV/Excel pair with a menu per format. */
  targets?: ExportActionTarget[];
}

async function resolveTargetRows(target: ExportActionTarget): Promise<ExportRow[]> {
  if (target.loadRows) {
    return target.loadRows();
  }
  return target.rows ?? [];
}

function isTargetReady(target: ExportActionTarget): boolean {
  return Boolean(target.loadRows) || (target.rows?.length ?? 0) > 0;
}

export function ExportActionButtons({
  baseName = "export",
  headers = [],
  rows = [],
  loadRows,
  dateFrom,
  dateTo,
  size = "medium",
  sheetName = "Datos",
  disabled = false,
  targets,
}: ExportActionButtonsProps) {
  const permissionsQuery = useCompanyPermissions();
  const canRead = hasPermission(permissionsQuery.data?.permissions, "reports:read");
  const canExportPerm = hasPermission(permissionsQuery.data?.permissions, "reports:export");
  const canExport = canRead && canExportPerm;
  const [isLoading, setIsLoading] = useState(false);

  const resolvedTargets: ExportActionTarget[] =
    targets && targets.length > 0
      ? targets
      : [
          {
            label: sheetName,
            baseName,
            headers,
            rows,
            loadRows,
            sheetName,
          },
        ];

  if (!canExport) {
    return null;
  }

  const buttonSize = size === "small" ? "compact-sm" : "sm";
  const anyReady = resolvedTargets.some(isTargetReady);
  const isDisabled = disabled || isLoading || !anyReady;
  const disabledTitle = disabled
    ? "Completá un rango de fechas válido antes de exportar."
    : undefined;
  const useMenu = resolvedTargets.length > 1;

  const runExport = async (
    target: ExportActionTarget,
    format: "csv" | "xlsx",
  ): Promise<void> => {
    setIsLoading(true);
    try {
      const exportRows = await resolveTargetRows(target);
      if (exportRows.length === 0) {
        return;
      }
      const filename = buildExportFilename(target.baseName, dateFrom, dateTo);
      if (format === "csv") {
        exportToCsv(filename, target.headers, exportRows);
      } else {
        exportToXlsx(filename, target.headers, exportRows, target.sheetName ?? target.label);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (!useMenu) {
    const target = resolvedTargets[0];
    return (
      <Group gap="xs">
        <Button
          size={buttonSize}
          variant="default"
          onClick={() => void runExport(target, "csv")}
          disabled={isDisabled}
          loading={isLoading}
          title={disabledTitle}
        >
          CSV
        </Button>
        <Button
          size={buttonSize}
          variant="default"
          onClick={() => void runExport(target, "xlsx")}
          disabled={isDisabled}
          loading={isLoading}
          title={disabledTitle}
        >
          Excel
        </Button>
      </Group>
    );
  }

  return (
    <Group gap="xs">
      <Menu withinPortal position="bottom-end">
        <Menu.Target>
          <Button
            size={buttonSize}
            variant="default"
            disabled={isDisabled}
            loading={isLoading}
            title={disabledTitle}
          >
            CSV
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {resolvedTargets.map((target) => (
            <Menu.Item
              key={`csv-${target.baseName}`}
              disabled={!isTargetReady(target)}
              onClick={() => void runExport(target, "csv")}
            >
              {target.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
      <Menu withinPortal position="bottom-end">
        <Menu.Target>
          <Button
            size={buttonSize}
            variant="default"
            disabled={isDisabled}
            loading={isLoading}
            title={disabledTitle}
          >
            Excel
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          {resolvedTargets.map((target) => (
            <Menu.Item
              key={`xlsx-${target.baseName}`}
              disabled={!isTargetReady(target)}
              onClick={() => void runExport(target, "xlsx")}
            >
              {target.label}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
