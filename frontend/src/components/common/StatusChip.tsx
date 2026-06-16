import { Chip, type ChipProps } from "@mui/material";

interface StatusChipProps {
  label: string;
  color?: ChipProps["color"];
}

export function StatusChip({ label, color = "default" }: StatusChipProps) {
  return <Chip label={label} color={color} size="small" variant="outlined" />;
}
