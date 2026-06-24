const CHECK_IN_INTENTS = [
  "llegue",
  "llegar",
  "checkin",
  "check-in",
  "asistencia",
  "registrar llegada",
] as const;

const SIMPLE_GREETINGS = ["hola", "buen dia", "buenos dias", "buenas tardes", "buenas noches"] as const;

export const normalizeIntentText = (text: string): string =>
  text
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const CHECKOUT_INTENTS = [
  "me voy",
  "termine",
  "terminé",
  "termine",
  "finalice",
  "finalicé",
  "salida",
  "salir",
] as const;

export const isCheckoutIntent = (body: string): boolean => {
  const normalized = normalizeIntentText(body);
  return CHECKOUT_INTENTS.some(
    (intent) => normalized === intent || normalized.includes(intent),
  );
};

export const isCheckInIntent = (body: string): boolean => {
  const normalized = normalizeIntentText(body);
  return CHECK_IN_INTENTS.some(
    (intent) => normalized === intent || normalized.includes(intent),
  );
};

export const isSimpleGreeting = (body: string): boolean => {
  const normalized = normalizeIntentText(body);
  return SIMPLE_GREETINGS.some(
    (greeting) => normalized === greeting || normalized.startsWith(`${greeting} `),
  );
};

export const parseInventorySelection = (body: string): number | null => {
  const normalized = normalizeIntentText(body);
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};
