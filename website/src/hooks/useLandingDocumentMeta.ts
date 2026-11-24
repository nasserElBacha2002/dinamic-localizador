import { LANDING_SEO } from "../content/landing-content";
import { useDocumentMeta } from "./useDocumentMeta";

export function useLandingDocumentMeta() {
  useDocumentMeta(LANDING_SEO);
}