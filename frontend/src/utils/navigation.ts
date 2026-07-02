import type { AdminNavItem, NavSectionKey } from "./company-modules";

export const NAV_SECTION_LABELS: Record<NavSectionKey, string> = {
  general: "General",
  operation: "Operación",
  management: "Gestión",
  tools: "Herramientas",
  settings: "Configuración",
};

export const NAV_SECTION_ORDER: NavSectionKey[] = [
  "general",
  "operation",
  "management",
  "tools",
  "settings",
];

export interface NavSectionGroup {
  key: NavSectionKey;
  label: string;
  items: AdminNavItem[];
}

export function groupAdminNavItems(items: AdminNavItem[]): NavSectionGroup[] {
  const buckets = new Map<NavSectionKey, AdminNavItem[]>();

  for (const item of items) {
    const sectionItems = buckets.get(item.section) ?? [];
    sectionItems.push(item);
    buckets.set(item.section, sectionItems);
  }

  return NAV_SECTION_ORDER.flatMap((key) => {
    const sectionItems = buckets.get(key);
    if (!sectionItems || sectionItems.length === 0) {
      return [];
    }

    return [{ key, label: NAV_SECTION_LABELS[key], items: sectionItems }];
  });
}
