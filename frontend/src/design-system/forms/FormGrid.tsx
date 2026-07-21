import { Box, SimpleGrid } from "@mantine/core";
import type { CSSProperties, ReactNode } from "react";

export interface FormGridProps {
  children: ReactNode;
  columns?: {
    base?: number;
    sm?: number;
    md?: number;
    lg?: number;
  };
  /** Align grid items (default stretch). Use "start" so row controls share a top baseline. */
  align?: CSSProperties["alignItems"];
}

function FormGridFull({ children }: { children: ReactNode }) {
  return <Box style={{ gridColumn: "1 / -1" }}>{children}</Box>;
}

export function FormGrid({
  children,
  columns = { base: 1, md: 2 },
  align = "stretch",
}: FormGridProps) {
  return (
    <SimpleGrid cols={columns} spacing="md" verticalSpacing="md" style={{ alignItems: align }}>
      {children}
    </SimpleGrid>
  );
}

FormGrid.Full = FormGridFull;
