import { Box, Modal, type ModalProps } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";
import { useIsBelow } from "../hooks/useIsBelow";

export type ResponsiveModalBodyMode = "normal" | "scroll";

export interface ResponsiveModalProps extends Omit<ModalProps, "fullScreen" | "centered"> {
  /** Desktop size; ignored when fullscreen on mobile. */
  size?: ModalProps["size"];
  /** Sticky footer actions (Cancel / Confirm). */
  footer?: ReactNode;
  /** Optional content pinned above the footer (outside the scroll body). */
  footerBanner?: ReactNode;
  children: ReactNode;
  /** Force fullscreen below this breakpoint (default sm). */
  fullScreenBelow?: "xs" | "sm" | "md";
  /**
   * `normal` — compact dialogs; Mantine content scrolls when height exceeds the viewport.
   * `scroll` — long forms/lists with a single inner scroll region + sticky footer.
   * Footer actions and mobile fullscreen use the pinned inner scroll layout.
   */
  bodyMode?: ResponsiveModalBodyMode;
}

const DESKTOP_MAX_HEIGHT = "min(90dvh, 860px)";
const VIEWPORT_HORIZONTAL_GUTTER = "calc(100vw - 2rem)";

/** Wider dialogs for ResponsiveModal only (does not change global Mantine Modal sizes). */
const RESPONSIVE_MODAL_DESKTOP_SIZE: Partial<Record<"lg" | "xl", string>> = {
  lg: "680px",
  xl: "920px",
};

type ModalStylesRecord = Partial<Record<"root" | "content" | "header" | "body" | "title" | "close", CSSProperties>>;

const PROTECTED_LAYOUT_KEYS: Partial<Record<keyof ModalStylesRecord, (keyof CSSProperties)[]>> = {
  content: ["display", "flexDirection", "overflow", "overflowX", "overflowY", "maxHeight", "maxWidth"],
  header: ["flexShrink"],
  body: ["display", "flexDirection", "flex", "minHeight", "overflow", "overflowX", "overflowY"],
};

function mergeSectionStyles(
  section: keyof ModalStylesRecord,
  layout: CSSProperties | undefined,
  custom: CSSProperties | undefined,
): CSSProperties | undefined {
  if (!layout && !custom) {
    return undefined;
  }
  if (!custom) {
    return layout;
  }
  if (!layout) {
    return custom;
  }
  const merged: CSSProperties = { ...layout, ...custom };
  const protectedKeys = PROTECTED_LAYOUT_KEYS[section];
  if (protectedKeys) {
    for (const key of protectedKeys) {
      if (layout[key] !== undefined) {
        (merged as Record<string, CSSProperties[keyof CSSProperties]>)[key] = layout[key]!;
      }
    }
  }
  return merged;
}

function mergeStyleRecords(
  layout: ModalStylesRecord | undefined,
  custom: ModalStylesRecord | undefined,
): ModalStylesRecord {
  if (!layout) {
    return custom ?? {};
  }
  if (!custom) {
    return layout;
  }
  const keys = new Set([...Object.keys(layout), ...Object.keys(custom)]);
  const merged: ModalStylesRecord = {};
  for (const key of keys) {
    const section = key as keyof ModalStylesRecord;
    merged[section] = mergeSectionStyles(section, layout[section], custom[section]);
  }
  return merged;
}

function mergeModalStyles(
  layout: ModalStylesRecord | undefined,
  custom: ModalProps["styles"],
): ModalProps["styles"] | undefined {
  if (!layout && !custom) {
    return undefined;
  }
  if (!custom) {
    return layout;
  }
  if (typeof custom === "function") {
    return (theme, props, ctx) => {
      const customResolved = custom(theme, props, ctx);
      return mergeStyleRecords(layout, customResolved as ModalStylesRecord);
    };
  }
  return mergeStyleRecords(layout, custom as ModalStylesRecord);
}

function resolveDesktopModalSize(size: ModalProps["size"]): ModalProps["size"] {
  if (size === "lg" || size === "xl") {
    return RESPONSIVE_MODAL_DESKTOP_SIZE[size] ?? size;
  }
  return size;
}

/**
 * Modal that becomes fullscreen below `sm` (configurable).
 * Same content tree for desktop and mobile.
 *
 * Pinned-footer layout keeps header/footer fixed and scrolls only the body. A bounded
 * flex chain (`flex: 1 1 0` + `minHeight: 0` + `overflow: auto`) is required so
 * the scroll region does not grow with content and clip behind the footer.
 *
 * Compact desktop dialogs rely on Mantine Modal content max-height + overflow-y (native scroll).
 */
export function ResponsiveModal({
  children,
  footer,
  footerBanner,
  size = "md",
  fullScreenBelow = "sm",
  bodyMode = "normal",
  ...modalProps
}: ResponsiveModalProps) {
  const isCompact = useIsBelow(fullScreenBelow);
  const { opened, onClose, title, styles: stylesProp, ...rest } = modalProps;
  const hasPinnedBottom = Boolean(footer || footerBanner);
  const usePinnedScrollLayout = bodyMode === "scroll" || hasPinnedBottom || isCompact;

  const desktopContentWidth = {
    maxWidth: `min(100%, ${VIEWPORT_HORIZONTAL_GUTTER})`,
  } satisfies CSSProperties;

  const pinnedContentStyles = {
    ...desktopContentWidth,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    overflowX: "hidden",
    maxHeight: isCompact ? "100dvh" : DESKTOP_MAX_HEIGHT,
  } satisfies CSSProperties;

  const pinnedBodyStyles = {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    minHeight: 0,
    overflow: "hidden",
    paddingBottom: hasPinnedBottom ? 0 : undefined,
  } satisfies CSSProperties;

  const nativeScrollContentStyles = {
    ...desktopContentWidth,
    maxHeight: DESKTOP_MAX_HEIGHT,
    overflowX: "hidden",
    overflowY: "auto",
  } satisfies CSSProperties;

  const layoutStyles: ModalStylesRecord | undefined = usePinnedScrollLayout
    ? {
        content: isCompact
          ? {
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              overflowX: "hidden",
              maxHeight: "100dvh",
            }
          : pinnedContentStyles,
        header: { flexShrink: 0 },
        body: pinnedBodyStyles,
      }
    : !isCompact
      ? {
          content: nativeScrollContentStyles,
        }
      : undefined;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size={isCompact ? "100%" : resolveDesktopModalSize(size)}
      fullScreen={isCompact}
      centered={!isCompact}
      padding={isCompact ? "md" : "lg"}
      closeButtonProps={{ "aria-label": "Cerrar" }}
      data-fullscreen={isCompact ? "true" : undefined}
      styles={mergeModalStyles(layoutStyles, stylesProp)}
      {...rest}
    >
      <Box
        style={
          usePinnedScrollLayout
            ? {
                display: "flex",
                flexDirection: "column",
                flex: "1 1 auto",
                minHeight: 0,
                height: "100%",
                overflow: "hidden",
                gap: "var(--mantine-spacing-md)",
              }
            : {
                display: "flex",
                flexDirection: "column",
                gap: "var(--mantine-spacing-md)",
              }
        }
      >
        {usePinnedScrollLayout ? (
          <Box
            data-testid="responsive-modal-scroll-body"
            style={{
              flex: "1 1 0%",
              minHeight: 0,
              overflowX: "hidden",
              overflowY: "auto",
              overscrollBehavior: "contain",
              paddingBottom: hasPinnedBottom ? "var(--mantine-spacing-md)" : 0,
              paddingRight: 4,
            }}
          >
            {children}
          </Box>
        ) : (
          <Box style={{ overflowX: "hidden" }}>{children}</Box>
        )}
        {footerBanner ? (
          <Box
            style={{ flexShrink: 0, maxHeight: "28%", overflow: "auto", minHeight: 0 }}
            data-testid="responsive-modal-footer-banner"
          >
            {footerBanner}
          </Box>
        ) : null}
        {footer ? (
          <Box
            className="dinamic-dialog-footer"
            pt="md"
            pb="md"
            px={0}
            style={{
              borderTop: "1px solid var(--mantine-color-gray-3)",
              flexShrink: 0,
              background: "var(--mantine-color-body)",
            }}
            data-testid="responsive-modal-footer"
          >
            {footer}
          </Box>
        ) : null}
      </Box>
    </Modal>
  );
}
