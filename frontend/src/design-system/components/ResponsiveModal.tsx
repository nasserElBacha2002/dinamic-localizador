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
   * `normal` — short content (confirmations); no nested scroll region.
   * `scroll` — long content with a single controlled scroll region + sticky footer.
   */
  bodyMode?: ResponsiveModalBodyMode;
}

const DESKTOP_MAX_HEIGHT = "min(90dvh, 860px)";

/**
 * Modal that becomes fullscreen below `sm` (configurable).
 * Same content tree for desktop and mobile.
 *
 * Scroll mode keeps header/footer fixed and scrolls only the body. A bounded
 * flex chain (`flex: 1 1 0` + `minHeight: 0` + `overflow: auto`) is required so
 * the scroll region does not grow with content and clip behind the footer.
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
  const { opened, onClose, title, ...rest } = modalProps;
  const useScrollBody = bodyMode === "scroll";
  const hasPinnedBottom = Boolean(footer || footerBanner);

  const scrollContentStyles = {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    maxHeight: isCompact ? "100dvh" : DESKTOP_MAX_HEIGHT,
  } satisfies CSSProperties;

  const scrollBodyStyles = {
    display: "flex",
    flexDirection: "column",
    flex: "1 1 auto",
    minHeight: 0,
    overflow: "hidden",
    // Footer owns bottom padding so the scroll viewport can use the full remaining height.
    paddingBottom: hasPinnedBottom ? 0 : undefined,
  } satisfies CSSProperties;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title}
      size={isCompact ? "100%" : size}
      fullScreen={isCompact}
      centered={!isCompact}
      padding={isCompact ? "md" : "lg"}
      closeButtonProps={{ "aria-label": "Cerrar" }}
      data-fullscreen={isCompact ? "true" : undefined}
      styles={
        useScrollBody
          ? {
              content: scrollContentStyles,
              header: { flexShrink: 0 },
              body: scrollBodyStyles,
            }
          : isCompact
            ? {
                content: {
                  display: "flex",
                  flexDirection: "column",
                  maxHeight: "calc(100dvh - 16px)",
                },
                header: { flexShrink: 0 },
                body: {
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  paddingBottom: hasPinnedBottom ? 0 : undefined,
                },
              }
            : undefined
      }
      {...rest}
    >
      <Box
        style={
          useScrollBody
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
        {useScrollBody ? (
          <Box
            data-testid="responsive-modal-scroll-body"
            style={{
              // flex-basis 0 forces this region to take only remaining space, not content height.
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
          <Box>{children}</Box>
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
            pt="sm"
            pb={isCompact ? "md" : 0}
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
