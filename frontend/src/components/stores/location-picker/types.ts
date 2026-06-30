import type { UseFormSetValue, UseFormTrigger } from "react-hook-form";
import type { StoreFormValues } from "../../../schemas/store.schema";

export interface StoreLocationPickerProps {
  isEditMode?: boolean;
  currentName?: string;
  latitude: number;
  longitude: number;
  address?: string;
  neighborhood?: string;
  locality?: string;
  googlePlaceId?: string | null;
  allowedRadiusMeters: number;
  setValue: UseFormSetValue<StoreFormValues>;
  trigger: UseFormTrigger<StoreFormValues>;
}

export type MapsLoadState = "loading" | "ready" | "error" | "disabled";

export const setValueOptions = { shouldDirty: true, shouldValidate: true } as const;
