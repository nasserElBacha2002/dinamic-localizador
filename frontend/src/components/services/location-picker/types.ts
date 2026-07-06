import type { UseFormSetValue, UseFormTrigger } from "react-hook-form";
import type { ServiceFormValues } from "../../../schemas/service.schema";

export interface ServiceLocationPickerProps {
  isEditMode?: boolean;
  currentName?: string;
  latitude: number;
  longitude: number;
  address?: string;
  neighborhood?: string;
  locality?: string;
  googlePlaceId?: string | null;
  allowedRadiusMeters: number;
  setValue: UseFormSetValue<ServiceFormValues>;
  trigger: UseFormTrigger<ServiceFormValues>;
}

export type MapsLoadState = "loading" | "ready" | "error" | "disabled";

export const setValueOptions = { shouldDirty: true, shouldValidate: true } as const;
