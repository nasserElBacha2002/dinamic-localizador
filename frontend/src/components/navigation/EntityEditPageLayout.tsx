import { Stack } from "@mantine/core";
import type { ReactNode } from "react";
import { PageHeader, type PageHeaderProps } from "../../design-system";

export interface EntityEditPageLayoutProps {
  title: PageHeaderProps["title"];
  description?: PageHeaderProps["description"];
  action?: PageHeaderProps["action"];
  breadcrumb?: PageHeaderProps["breadcrumb"];
  children: ReactNode;
}

/**
 * Thin shell for `/edit` pages — header + content spacing only.
 * Does not know schemas, DTOs, endpoints, or domain rules.
 */
export function EntityEditPageLayout({
  title,
  description,
  action,
  breadcrumb,
  children,
}: EntityEditPageLayoutProps) {
  return (
    <Stack gap="md">
      <PageHeader
        title={title}
        description={description}
        action={action}
        breadcrumb={breadcrumb}
      />
      {children}
    </Stack>
  );
}
