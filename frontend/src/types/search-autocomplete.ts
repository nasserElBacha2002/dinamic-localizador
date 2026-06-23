export interface SearchAutocompleteOption {
  id: string;
  label: string;
  description?: string | null;
  disabled?: boolean;
  isCreateAction?: boolean;
}

export const CREATE_OPTION_ID = "__create__";
