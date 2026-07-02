import { Select } from "@mantine/core";

export interface FilterSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface FilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  data: FilterSelectOption[];
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
}

export function FilterSelect({
  label,
  value,
  onChange,
  data,
  placeholder,
  clearable = false,
  disabled = false,
}: FilterSelectProps) {
  return (
    <Select
      label={label}
      placeholder={placeholder}
      disabled={disabled}
      clearable={clearable}
      data={data}
      value={value}
      onChange={(nextValue) => onChange(nextValue ?? "")}
    />
  );
}
