import { TextField, type SxProps, type Theme } from "@mui/material";
import { useEffect, useRef, useState } from "react";
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
  const onSearchRef = useRef(onSearch);

  useEffect(() => {
    onSearchRef.current = onSearch;
  }, [onSearch]);

  useEffect(() => {
    onSearchRef.current(debouncedValue.trim());
  }, [debouncedValue]);

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
