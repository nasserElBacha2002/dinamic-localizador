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

// Exit template copy asks users to reply "Me voy"; keep aligned with approved Twilio content.
const CHECKOUT_INTENTS = [
  "me voy",
  "termine",
  "terminé",
  "finalice",
  "finalicé",
  "salida",
] as const;

const GLOBAL_MENU_COMMANDS = ["menu", "inicio"] as const;
const GLOBAL_HELP_COMMANDS = ["ayuda", "help"] as const;
// "salir" is a global cancel command (exits the active flow).
// For checkout/departure, employees should use "Me voy", "Terminé", "Finalicé", or "Salida".
const GLOBAL_CANCEL_COMMANDS = ["cancelar", "salir"] as const;
const GLOBAL_BACK_COMMANDS = ["volver"] as const;

const matchesCommand = (body: string, commands: readonly string[]): boolean => {
  const normalized = normalizeIntentText(body);
  return commands.some(
    (command) => normalized === command || normalized.startsWith(`${command} `),
  );
};

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

export const isGlobalMenuCommand = (body: string): boolean => matchesCommand(body, GLOBAL_MENU_COMMANDS);

export const isGlobalHelpCommand = (body: string): boolean => matchesCommand(body, GLOBAL_HELP_COMMANDS);

export const isGlobalCancelCommand = (body: string): boolean =>
  matchesCommand(body, GLOBAL_CANCEL_COMMANDS);

export const isGlobalBackCommand = (body: string): boolean => matchesCommand(body, GLOBAL_BACK_COMMANDS);

export const parseOperationSelection = (body: string): number | null => {
  const normalized = normalizeIntentText(body);
  if (!/^\d+$/.test(normalized)) {
    return null;
  }

  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
};
