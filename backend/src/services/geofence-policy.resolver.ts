import { env } from "../config/env";
import { DEFAULT_COMPANY_OPERATIONAL_SETTINGS } from "../constants/company-settings";
import { AppError } from "../errors/app-error";
import { companySettingsRepository } from "../repositories/company-settings.repository";
import type { CompanySettings } from "../types/company";

export type GeofencePolicySource = "service" | "company_settings" | "operational_defaults" | "environment";

export type GeofencePolicy = {
  companyId: string;
  /** Effective allowed radius for distance evaluation. */
  radiusMeters: number;
  /** Review band beyond radius (PENDING_REVIEW). */
  marginMeters: number;
  radiusSource: GeofencePolicySource;
  marginSource: GeofencePolicySource;
};

export type GeofenceSettingsSnapshot = Pick<
  CompanySettings,
  "defaultRadiusMeters" | "geofenceReviewMarginMeters"
> | null;

const isClientError = (error: unknown): boolean =>
  error instanceof AppError && error.statusCode >= 400 && error.statusCode < 500;

/**
 * Single source of truth for geofence radius + review margin.
 *
 * Precedence:
 * - radius: service.allowedRadiusMeters (>0) → company defaultRadiusMeters → env BOT_DEFAULT_RADIUS_METERS
 * - margin: company geofenceReviewMarginMeters (≥0) → env BOT_GEOFENCE_REVIEW_MARGIN_METERS
 *
 * Prefer `resolveFromSettings` when settings were already loaded (single snapshot).
 * Load failures (non-4xx) surface as GEOFENCE_POLICY_UNAVAILABLE — no silent env fallback.
 */
export const geofencePolicyResolver = {
  /**
   * Pure derivation from an already-loaded company settings row (or null).
   * Does not touch the repository — use for single-snapshot flows.
   */
  resolveFromSettings(
    companyId: string,
    settings: GeofenceSettingsSnapshot,
    serviceAllowedRadiusMeters: number,
  ): GeofencePolicy {
    const base = this.companyDefaultsFromSettings(companyId, settings);

    if (serviceAllowedRadiusMeters > 0) {
      return {
        ...base,
        radiusMeters: serviceAllowedRadiusMeters,
        radiusSource: "service",
      };
    }

    return base;
  },

  companyDefaultsFromSettings(
    companyId: string,
    settings: GeofenceSettingsSnapshot,
  ): GeofencePolicy {
    if (!settings) {
      return {
        companyId,
        radiusMeters:
          DEFAULT_COMPANY_OPERATIONAL_SETTINGS.defaultRadiusMeters || env.BOT_DEFAULT_RADIUS_METERS,
        marginMeters: env.BOT_GEOFENCE_REVIEW_MARGIN_METERS,
        radiusSource: "operational_defaults",
        marginSource: "environment",
      };
    }

    const radiusFromCompany = settings.defaultRadiusMeters > 0;
    const marginFromCompany =
      settings.geofenceReviewMarginMeters != null && settings.geofenceReviewMarginMeters >= 0;

    return {
      companyId,
      radiusMeters: radiusFromCompany
        ? settings.defaultRadiusMeters
        : env.BOT_DEFAULT_RADIUS_METERS,
      marginMeters: marginFromCompany
        ? (settings.geofenceReviewMarginMeters as number)
        : env.BOT_GEOFENCE_REVIEW_MARGIN_METERS,
      radiusSource: radiusFromCompany ? "company_settings" : "environment",
      marginSource: marginFromCompany ? "company_settings" : "environment",
    };
  },

  async resolveForService(
    companyId: string,
    serviceAllowedRadiusMeters: number,
  ): Promise<GeofencePolicy> {
    const settings = await this.loadSettingsOrThrow(companyId);
    return this.resolveFromSettings(companyId, settings, serviceAllowedRadiusMeters);
  },

  async resolveCompanyDefaults(companyId: string): Promise<GeofencePolicy> {
    const settings = await this.loadSettingsOrThrow(companyId);
    return this.companyDefaultsFromSettings(companyId, settings);
  },

  async loadSettingsOrThrow(companyId: string): Promise<GeofenceSettingsSnapshot> {
    try {
      return await companySettingsRepository.findByCompanyId(companyId);
    } catch (error) {
      if (isClientError(error)) {
        throw error;
      }

      throw new AppError(
        503,
        "GEOFENCE_POLICY_UNAVAILABLE",
        "No se pudo cargar la política de geocerca de la empresa. Reintentá más tarde.",
        {
          companyId,
          cause: error instanceof Error ? error.message : "UNKNOWN",
        },
      );
    }
  },
};
