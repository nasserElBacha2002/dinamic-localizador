import sql from "mssql";
import { locationZoneRepository } from "../repositories/location-zone.repository";

/**
 * Associates the standard CABA/GBA catalog zones with a company (idempotent).
 * Does not create global zones; relies on migration 110 (or equivalent catalog data).
 */
export const companyLocationZoneDefaultsService = {
  async ensureDefaultGenericZonesForCompany(
    companyId: string,
    transaction?: sql.Transaction,
  ): Promise<void> {
    await locationZoneRepository.ensureGenericDefaultAssociationsForCompany(
      companyId,
      transaction,
    );
  },

  /**
   * Post-commit: geocode PENDING zones in the shared global catalog for this company's associations.
   * Zones already RESOLVED/MANUAL elsewhere are visible immediately (same location_zones row).
   */
  scheduleGeocodingBackfillForCompany(companyId: string): void {
    setImmediate(() => {
      void (async () => {
        const { locationZoneGeocodingService } = await import(
          "./location-zone-geocoding.service"
        );
        await locationZoneGeocodingService.backfill({
          companyId,
          delayMs: 250,
          includeFailed: true,
        });
      })().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("[company-location-zone-defaults] geocoding backfill failed", {
          companyId,
          errorMessage: message,
        });
      });
    });
  },
};
