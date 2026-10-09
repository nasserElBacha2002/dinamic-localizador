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
};
