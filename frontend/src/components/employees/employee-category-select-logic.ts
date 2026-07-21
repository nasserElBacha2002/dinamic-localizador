import { normalizeCategoryName } from "../../utils/normalize-category-name";

export function shouldOfferEmployeeCategoryCreate(input: {
  input: string;
  categoryNames: string[];
  canCreate: boolean;
  catalogReady: boolean;
  createPending: boolean;
}): boolean {
  const trimmed = input.input.trim();
  if (!input.canCreate || !input.catalogReady || !trimmed || input.createPending) {
    return false;
  }

  const normalizedInput = normalizeCategoryName(trimmed);
  const exactMatch = input.categoryNames.some(
    (name) => normalizeCategoryName(name) === normalizedInput,
  );
  return !exactMatch;
}
