export type MarketingEventName =
  | "landing_view"
  | "cta_demo_click"
  | "cta_how_it_works_click"
  | "demo_form_start"
  | "demo_form_submitted";

export type MarketingEventPayload = Record<string, string | number | boolean | undefined>;

/** Adaptador desacoplado; conectar proveedor de analytics en una iteración posterior. */
export function trackMarketingEvent(name: MarketingEventName, payload?: MarketingEventPayload): void {
  if (import.meta.env?.DEV) {
    console.debug("[marketing]", name, payload ?? {});
  }
}
