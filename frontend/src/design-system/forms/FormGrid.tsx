import { Box, SimpleGrid } from "@mantine/core";
import type { ReactNode } from "react";

export interface FormGridProps {
  children: ReactNode;
  columns?: {
    base?: number;
    sm?: number;
    md?: number;
    lg?: number;
  };
}

function FormGridFull({ children }: { children: ReactNode }) {
  return <Box style={{ gridColumn: "1 / -1" }}>{children}</Box>;
}

export function FormGrid({
  children,
  columns = { base: 1, md: 2 },
}: FormGridProps) {
  return (
    <SimpleGrid cols={columns} spacing="md" verticalSpacing="md">
      {children}
    </SimpleGrid>
  );
}

FormGrid.Full = FormGridFull;
