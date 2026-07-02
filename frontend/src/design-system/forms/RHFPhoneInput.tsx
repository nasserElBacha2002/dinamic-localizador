import type { Control, FieldPath, FieldValues } from "react-hook-form";
import { RHFTextInput, type RHFTextInputProps } from "./RHFTextInput";

export interface RHFPhoneInputProps<T extends FieldValues>
  extends Omit<RHFTextInputProps<T>, "type"> {
  control: Control<T>;
  name: FieldPath<T>;
}

export function RHFPhoneInput<T extends FieldValues>(props: RHFPhoneInputProps<T>) {
  return <RHFTextInput {...props} type="tel" />;
}
