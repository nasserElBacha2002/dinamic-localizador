import { LANDING_SEO } from "../content/landing-content";
import { useDocumentMeta, type DocumentSeo } from "./useDocumentMeta";

export type LandingDocumentMetaOptions = {
  ogImage?: string;
  ogImageAlt?: string;
};

export function useLandingDocumentMeta(options?: LandingDocumentMetaOptions) {
  const seo: DocumentSeo = {
    ...LANDING_SEO,
    ogImage: options?.ogImage,
    ogImageAlt: options?.ogImageAlt,
  };
  useDocumentMeta(seo);
}