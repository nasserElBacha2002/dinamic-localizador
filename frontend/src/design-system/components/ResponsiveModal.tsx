import { Box, Modal, ScrollArea, Stack, type ModalProps } from "@mantine/core";
import type { ReactNode } from "react";
import { useIsBelow } from "../hooks/useIsBelow";

export interface ResponsiveModalProps extends Omit<ModalProps, "fullScreen" | "centered"> {
  /** Desktop size; ignored when fullscreen on mobile. */
  size?: ModalProps["size"];
  /** Sticky footer actions (Cancel / Confirm). */
  footer?: ReactNode;
  children: ReactNode;
  /** Force fullscreen below this breakpoint (default sm). */
  fullScreenBelow?: "xs" | "sm" | "md";
}

/**
 * Modal that becomes fullscreen below `sm` (configurable) with a scrollable body
 * and optional sticky footer — same content tree for desktop and mobile.
 */
export function ResponsiveModal({
  children,
  footer,
  size = "md",
  fullScreenBelow = "sm",
  ...modalProps
}: ResponsiveModalProps) {
  const isCompact = useIsBelow(fullScreenBelow);
  const { opened, onClose, title, ...rest } = modalProps;

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
      styles={
        isCompact
          ? {
              body: {
                display: "flex",
                flexDirection: "column",
                height: "calc(100dvh - var(--modal-header-height, 60px))",
                maxHeight: "calc(100dvh - var(--modal-header-height, 60px))",
                overflow: "hidden",
                paddingBottom: 0,
              },
              content: { display: "flex", flexDirection: "column" },
            }
          : undefined
      }
      {...rest}
    >
      <Stack gap="md" style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        <ScrollArea
          type="auto"
          offsetScrollbars
          style={{ flex: 1, minHeight: 0 }}
          styles={{ viewport: { paddingBottom: footer ? 8 : 0 } }}
        >
          <Box pr={4}>{children}</Box>
        </ScrollArea>
        {footer ? (
          <Box
            pt="sm"
            pb={isCompact ? "md" : 0}
            style={{
              borderTop: "1px solid var(--mantine-color-gray-3)",
              flexShrink: 0,
              background: "var(--mantine-color-body)",
            }}
          >
            {footer}
          </Box>
        ) : null}
      </Stack>
    </Modal>
  );
}
