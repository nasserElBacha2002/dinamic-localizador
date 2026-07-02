import { TextInput } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";

interface SearchFieldProps {
  label?: string;
  placeholder?: string;
  onSearch: (value: string) => void;
  debounceMs?: number;
  fullWidth?: boolean;
}

export function SearchField({
  label = "Buscar",
  placeholder,
  onSearch,
  debounceMs = 300,
  fullWidth = false,
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
    <TextInput
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => setValue(event.currentTarget.value)}
      style={fullWidth ? { width: "100%" } : undefined}
    />
  );
}
