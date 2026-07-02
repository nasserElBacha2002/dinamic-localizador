import { CloseButton, TextInput } from "@mantine/core";
import type { KeyboardEvent } from "react";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
  placeholder?: string;
  label?: string;
  clearable?: boolean;
}

export function SearchInput({
  value,
  onChange,
  onSearch,
  placeholder = "Buscar...",
  label,
  clearable = true,
}: SearchInputProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && onSearch) {
      onSearch(value);
    }
  };

  return (
    <TextInput
      label={label}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
      onKeyDown={handleKeyDown}
      rightSection={
        clearable && value ? (
          <CloseButton
            aria-label="Limpiar búsqueda"
            onClick={() => onChange("")}
            size="sm"
          />
        ) : null
      }
    />
  );
}
