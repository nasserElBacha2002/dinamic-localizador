import { TextField, type SxProps, type Theme } from "@mui/material";
import { useEffect, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

interface SearchFieldProps {
  label?: string;
  placeholder?: string;
  onSearch: (value: string) => void;
  debounceMs?: number;
  fullWidth?: boolean;
  sx?: SxProps<Theme>;
}

export function SearchField({
  label = "Buscar",
  placeholder,
  onSearch,
  debounceMs = 300,
  fullWidth = false,
  sx,
}: SearchFieldProps) {
  const [value, setValue] = useState("");
  const debouncedValue = useDebouncedValue(value, debounceMs);

  useEffect(() => {
    onSearch(debouncedValue.trim());
  }, [debouncedValue, onSearch]);

  return (
    <TextField
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      fullWidth={fullWidth}
      sx={sx}
    />
  );
}
