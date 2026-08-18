import sql from "mssql";
import { getPool } from "../database/connection";

/**
 * Inserts an operational_locations row compatible with AFTER INSERT triggers
 * (OUTPUT … INTO required when triggers exist on the table).
 */
export async function insertOperationalLocationFixture(input: {
  companyId: string;
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
  allowedRadiusMeters?: number;
  locationZoneId?: string | null;
}): Promise<string> {
  const result = await getPool()
    .request()
    .input("companyId", sql.UniqueIdentifier, input.companyId)
    .input("name", sql.NVarChar(200), input.name)
    .input("address", sql.NVarChar(300), input.address ?? "Test")
    .input("latitude", sql.Decimal(10, 7), input.latitude)
    .input("longitude", sql.Decimal(10, 7), input.longitude)
    .input("radius", sql.Int, input.allowedRadiusMeters ?? 150)
    .input("locationZoneId", sql.UniqueIdentifier, input.locationZoneId ?? null)
    .query(`
      DECLARE @inserted TABLE (id UNIQUEIDENTIFIER);
      INSERT INTO operational_locations (
        company_id, name, address, latitude, longitude, allowed_radius_meters, active, location_zone_id
      )
      OUTPUT INSERTED.id INTO @inserted (id)
      VALUES (
        @companyId, @name, @address, @latitude, @longitude, @radius, 1, @locationZoneId
      );
      SELECT id FROM @inserted;
    `);
  return String(result.recordset[0].id);
}
