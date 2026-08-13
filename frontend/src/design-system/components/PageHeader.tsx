import { Group, Stack, Text, Title } from "@mantine/core";
import type { ReactNode } from "react";
import { useIsBelow } from "../hooks/useIsBelow";
import { EntityAvatar } from "./EntityAvatar";
import type { EntityAvatarEntityType } from "./entity-avatar.types";
import classes from "./page-header.module.css";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  breadcrumb?: ReactNode;
}

export interface EntityPageTitleProps {
  name: string;
  entityType: EntityAvatarEntityType;
}

/** Avatar + wrapping name for entity detail headers (safe on narrow viewports). */
export function EntityPageTitle({ name, entityType }: EntityPageTitleProps) {
  return (
    <div className={classes.pageTitle}>
      <EntityAvatar name={name} entityType={entityType} size="lg" />
      <span className={classes.pageTitleName}>{name}</span>
    </div>
  );
}

/**
 * Page title + optional actions.
 * Mobile: stack title above actions (avoids flex collision / overlap).
 * Desktop: title and actions on one row.
 */
export function PageHeader({ title, description, action, breadcrumb }: PageHeaderProps) {
  const isMobile = useIsBelow("sm");

  const titleBlock = (
    <Stack gap={4} className={classes.titleBlock}>
      <Title order={2} className={classes.title}>
        {title}
      </Title>
      {description ? (
        <Text size="sm" c="dimmed" style={{ overflowWrap: "anywhere" }}>
          {description}
        </Text>
      ) : null}
    </Stack>
  );

  const actionBlock = action ? (
    <Group
      gap="sm"
      wrap="wrap"
      justify={isMobile ? "flex-start" : "flex-end"}
      className={isMobile ? `${classes.actions} ${classes.actionsMobile}` : classes.actions}
    >
      {action}
    </Group>
  ) : null;

  return (
    <Stack gap="sm" mb="lg" className={classes.root}>
      {breadcrumb ? <div>{breadcrumb}</div> : null}
      {isMobile ? (
        <Stack gap="md" style={{ minWidth: 0, width: "100%" }}>
          {titleBlock}
          {actionBlock}
        </Stack>
      ) : (
        <Group justify="space-between" align="flex-start" wrap="nowrap" gap="md">
          {titleBlock}
          {actionBlock}
        </Group>
      )}
    </Stack>
  );
}
