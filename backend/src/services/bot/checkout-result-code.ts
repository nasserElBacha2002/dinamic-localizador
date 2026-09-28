import type { CheckoutStatus } from "../../constants/checkout-status";
import {
  WHATSAPP_RESULT_CODES,
  type WhatsappResultCode,
} from "../../constants/whatsapp-observability";

/**
 * Maps durable checkout validation status to WhatsApp observability result codes.
 * Pure: no I/O — used by bot checkout orchestration only.
 */
export const resolveCheckoutWhatsAppResultCode = (input: {
  checkoutStatus: CheckoutStatus;
  checkoutWithoutArrival: boolean;
}): WhatsappResultCode => {
  if (input.checkoutStatus === "CHECKOUT_REJECTED") {
    return WHATSAPP_RESULT_CODES.LOCATION_OUTSIDE_ALLOWED_RADIUS;
  }
  return input.checkoutWithoutArrival
    ? WHATSAPP_RESULT_CODES.CHECKOUT_WITHOUT_ARRIVAL
    : WHATSAPP_RESULT_CODES.CHECKOUT_COMPLETED;
};

export const roundCheckoutDistanceMeters = (distanceMeters: number): number =>
  Math.round(distanceMeters * 100) / 100;
