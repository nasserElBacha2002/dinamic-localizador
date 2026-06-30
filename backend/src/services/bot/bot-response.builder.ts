import { env } from "../../config/env";
import type { CheckoutStatus } from "../../constants/checkout-status";
import type { PunctualityStatus } from "../../types/domain";
import type { CheckoutEligibleInventory, CompatibleInventory } from "../../types/twilio.types";
import { formatLocalTime } from "../../utils/attendance-validation";
import { checkoutStatusLabel } from "../../utils/checkout-validation";

export const GLOBAL_CANCEL_MESSAGE =
  "Flujo cancelado. Ahora podés iniciar otra operación.";

export const UNKNOWN_EMPLOYEE_MESSAGE =
  "No encontramos un empleado activo asociado a este número de WhatsApp. Contactá a administración.";

export const GREETING_MESSAGE =
  'Hola. Para registrar tu llegada escribí "Llegué". Para registrar tu salida escribí "Me voy". Para pedir una ausencia escribí "Quiero pedir vacaciones" o "Pedir ausencia".';

export const ACTIVE_ATTENDANCE_FLOW_MESSAGE =
  'Ya tenés un flujo de llegada o salida en curso. Completalo o escribí "Cancelar" antes de solicitar una ausencia.';

export const NO_CHECK_IN_FOR_CHECKOUT_MESSAGE =
  "No encontré una llegada registrada para este inventario. Primero tenés que haber marcado 'Llegué'.";

export const NO_CHECKOUT_INVENTORY_MESSAGE =
  "No encontramos un inventario con llegada registrada pendiente de salida. Verificá con administración.";

export const LOCATION_WITHOUT_CHECKOUT_SESSION_MESSAGE =
  'Para registrar tu salida, primero escribí "Me voy".';

export const WAITING_CHECKOUT_LOCATION_TEXT_MESSAGE =
  "Todavía necesitamos tu ubicación actual para registrar la salida. Usá Adjuntar → Ubicación → Enviar tu ubicación actual.";

export const LOCATION_DURING_CHECKOUT_SELECTION_MESSAGE =
  "Primero seleccioná el inventario para registrar la salida respondiendo con el número correspondiente.";

export const DUPLICATE_CHECKOUT_MESSAGE = "Tu salida ya había sido registrada anteriormente.";

export const CHECKOUT_REMINDER =
  "Cuando finalices el inventario, enviá 'Me voy' para registrar tu salida.";

export const NO_INVENTORY_MESSAGE =
  "No encontramos un inventario asignado para vos en la fecha y horario actuales. Verificá con administración.";

export const LOCATION_WITHOUT_SESSION_MESSAGE =
  'Para registrar tu llegada, primero escribí "Llegué".';

export const WAITING_LOCATION_TEXT_MESSAGE =
  "Todavía necesitamos tu ubicación actual. Usá Adjuntar → Ubicación → Enviar tu ubicación actual.";

export const LOCATION_DURING_SELECTION_MESSAGE =
  "Primero seleccioná el inventario respondiendo con el número correspondiente.";

export const INVALID_SELECTION_MESSAGE =
  "La opción ingresada no es válida. Respondé con uno de los números disponibles.";

export const UNPARSEABLE_MESSAGE =
  'No pudimos interpretar el mensaje. Para registrar tu llegada escribí "Llegué".';

export const DUPLICATE_ATTENDANCE_MESSAGE = "Ya registraste tu llegada para este inventario.";

export const DUPLICATE_MESSAGE_SID_RESPONSE = "Ya procesamos tu mensaje anterior.";

export const GENERIC_ERROR_MESSAGE =
  "No pudimos procesar tu solicitud en este momento.\nIntentá nuevamente o contactá a tu supervisor.";

export const INVALID_COORDINATES_MESSAGE =
  "Las coordenadas recibidas no son válidas. Volvé a compartir tu ubicación actual.";

export const buildMainMenuMessage = (): string => GREETING_MESSAGE;

export const buildSessionExpiredMessage = (message: string): string => message;

export const buildNoInventoryMessage = (): string => NO_INVENTORY_MESSAGE;

export const buildLocationRequestMessage = (inventory: CompatibleInventory): string => {
  const localTime = formatLocalTime(inventory.scheduledStart, env.BOT_OPERATION_TIMEZONE);
  return `Encontramos tu inventario en ${inventory.storeName}, programado para las ${localTime}.\n\nCompartí tu ubicación actual desde WhatsApp para registrar tu llegada.`;
};

export const buildInventorySelectionPrompt = (inventories: CompatibleInventory[]): string => {
  const lines = inventories.map((inventory, index) => {
    const localTime = formatLocalTime(inventory.scheduledStart, env.BOT_OPERATION_TIMEZONE);
    return `${index + 1}. ${inventory.storeName} — ${localTime}`;
  });

  return `Encontramos más de un inventario compatible:\n\n${lines.join("\n")}\n\nRespondé con el número correspondiente.`;
};

export const buildCheckoutLocationRequestMessage = (
  inventory: CheckoutEligibleInventory,
): string => {
  const localTime = formatLocalTime(inventory.scheduledStart, env.BOT_OPERATION_TIMEZONE);
  return `Perfecto. Para registrar tu salida del inventario en ${inventory.storeName} (${localTime}), compartime tu ubicación actual.`;
};

export const buildCheckoutInventorySelectionPrompt = (
  inventories: CheckoutEligibleInventory[],
): string => {
  const lines = inventories.map((inventory, index) => {
    const localTime = formatLocalTime(inventory.scheduledStart, env.BOT_OPERATION_TIMEZONE);
    return `${index + 1}. ${inventory.storeName} — ${localTime}`;
  });

  return `Encontramos más de un inventario con llegada registrada:\n\n${lines.join("\n")}\n\nRespondé con el número correspondiente para registrar la salida.`;
};

export const buildArrivalRegisteredMessage = (input: {
  compatible: CompatibleInventory;
  distanceMeters: number;
  validationStatus: "VALID" | "PENDING_REVIEW" | "REJECTED";
  punctualityStatus: PunctualityStatus;
  validationReason: string;
  receivedAt: Date;
}): string => {
  const localTime = formatLocalTime(input.receivedAt.toISOString(), env.BOT_OPERATION_TIMEZONE);
  const roundedDistance = Math.round(input.distanceMeters);

  if (input.validationStatus === "REJECTED") {
    return buildOutsideRadiusMessage(input.validationReason);
  }

  if (input.validationStatus === "VALID") {
    const headline =
      input.punctualityStatus === "LATE"
        ? "Tu llegada fue registrada como tarde."
        : "Tu llegada fue registrada correctamente.";
    return `${headline}\n\nTienda: ${input.compatible.storeName}\nLlegada: ${localTime}\nDistancia: ${roundedDistance} m\n\n${CHECKOUT_REMINDER}`;
  }

  return buildReviewRequiredMessage({
    storeName: input.compatible.storeName,
    localTime,
    roundedDistance,
    flow: "arrival",
  });
};

export const buildCheckoutRegisteredMessage = (input: {
  eligible: CheckoutEligibleInventory;
  checkInAt: string;
  checkoutAt: Date;
  distanceMeters: number;
  checkoutStatus: CheckoutStatus;
  extraWorkedMinutes: number;
}): string => {
  const arrivalTime = formatLocalTime(input.checkInAt, env.BOT_OPERATION_TIMEZONE);
  const departureTime = formatLocalTime(input.checkoutAt.toISOString(), env.BOT_OPERATION_TIMEZONE);
  const roundedDistance = Math.round(input.distanceMeters);
  const statusLabel = checkoutStatusLabel(input.checkoutStatus);

  if (input.checkoutStatus === "CHECKOUT_REJECTED") {
    return buildCheckoutRejectedMessage();
  }

  if (
    input.checkoutStatus === "CHECKOUT_LOCATION_REVIEW" ||
    input.checkoutStatus === "CHECKOUT_EARLY_REVIEW"
  ) {
    const reason =
      input.checkoutStatus === "CHECKOUT_LOCATION_REVIEW"
        ? "estás fuera del radio permitido"
        : "saliste antes del horario previsto";
    return `Tu salida fue registrada, pero quedó pendiente de revisión porque ${reason}.\n\nTienda: ${input.eligible.storeName}\nLlegada: ${arrivalTime}\nSalida: ${departureTime}\nDistancia: ${roundedDistance} m\nEstado: ${statusLabel}`;
  }

  let message = `Tu salida fue registrada correctamente.\n\nTienda: ${input.eligible.storeName}\nLlegada: ${arrivalTime}\nSalida: ${departureTime}\nDistancia: ${roundedDistance} m\nEstado: ${statusLabel}`;

  if (input.checkoutStatus === "CHECKOUT_LATE_EXTRA_TIME" && input.extraWorkedMinutes > 0) {
    message += `\nTiempo extra: ${input.extraWorkedMinutes} min`;
  }

  return message;
};

export const buildOutsideRadiusMessage = (reason: string): string =>
  `❌ No pudimos validar tu llegada.\n\nMotivo: ${reason}\nContactá a tu supervisor si considerás que existe un error.`;

export const buildCheckoutRejectedMessage = (): string =>
  `❌ No pudimos registrar tu salida.\n\nMotivo: ubicación fuera del radio permitido.\nContactá a tu supervisor si considerás que existe un error.`;

export const buildReviewRequiredMessage = (input: {
  storeName: string;
  localTime: string;
  roundedDistance: number;
  flow: "arrival" | "checkout";
}): string => {
  if (input.flow === "arrival") {
    return `Tu llegada fue registrada, pero quedó pendiente de revisión.\n\nTienda: ${input.storeName}\nLlegada: ${input.localTime}\nDistancia: ${input.roundedDistance} m\n\n${CHECKOUT_REMINDER}`;
  }

  return `Tu salida fue registrada, pero quedó pendiente de revisión.\n\nTienda: ${input.storeName}\nDistancia: ${input.roundedDistance} m`;
};
