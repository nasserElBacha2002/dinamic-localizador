import {
  canonicalizeLocationZoneDisplayName,
  canonicalizeLocationZoneLocality,
  normalizeLocationZoneLocality,
  normalizeLocationZoneName,
} from "../utils/normalize-location-zone-name";

/**
 * Canonical CABA / GBA geographic zones (matches migration 110_seed_caba_gba_location_zones.sql).
 * Seeded into the global location_zones catalog; new companies receive associations only.
 */
export type DefaultGenericLocationZoneSeed = {
  name: string;
  locality: string;
};

export type DefaultGenericLocationZoneNormalizedKey = DefaultGenericLocationZoneSeed & {
  normalizedName: string;
  normalizedLocality: string;
};

export const resolveDefaultGenericLocationZoneNormalizedKeys =
  (): DefaultGenericLocationZoneNormalizedKey[] =>
    DEFAULT_GENERIC_LOCATION_ZONE_SEEDS.map((seed) => {
      const name = canonicalizeLocationZoneDisplayName(seed.name);
      const locality = canonicalizeLocationZoneLocality(seed.locality);
      const normalizedName = normalizeLocationZoneName(name);
      const normalizedLocality = normalizeLocationZoneLocality(locality);
      if (!normalizedName) {
        throw new Error(`Invalid default location zone seed name: ${seed.name}`);
      }
      return {
        name,
        locality: locality ?? seed.locality,
        normalizedName,
        normalizedLocality,
      };
    });

export const DEFAULT_GENERIC_LOCATION_ZONE_SEEDS: DefaultGenericLocationZoneSeed[] = [
  { name: "Agronomía", locality: "CABA" },
  { name: "Almagro", locality: "CABA" },
  { name: "Balvanera", locality: "CABA" },
  { name: "Barracas", locality: "CABA" },
  { name: "Belgrano", locality: "CABA" },
  { name: "Boedo", locality: "CABA" },
  { name: "Caballito", locality: "CABA" },
  { name: "Chacarita", locality: "CABA" },
  { name: "Coghlan", locality: "CABA" },
  { name: "Colegiales", locality: "CABA" },
  { name: "Constitución", locality: "CABA" },
  { name: "Flores", locality: "CABA" },
  { name: "Floresta", locality: "CABA" },
  { name: "La Boca", locality: "CABA" },
  { name: "Liniers", locality: "CABA" },
  { name: "Mataderos", locality: "CABA" },
  { name: "Monserrat", locality: "CABA" },
  { name: "Monte Castro", locality: "CABA" },
  { name: "Nueva Pompeya", locality: "CABA" },
  { name: "Núñez", locality: "CABA" },
  { name: "Palermo", locality: "CABA" },
  { name: "Parque Avellaneda", locality: "CABA" },
  { name: "Parque Chacabuco", locality: "CABA" },
  { name: "Parque Chas", locality: "CABA" },
  { name: "Parque Patricios", locality: "CABA" },
  { name: "Paternal", locality: "CABA" },
  { name: "Puerto Madero", locality: "CABA" },
  { name: "Recoleta", locality: "CABA" },
  { name: "Retiro", locality: "CABA" },
  { name: "Saavedra", locality: "CABA" },
  { name: "San Cristóbal", locality: "CABA" },
  { name: "San Nicolás", locality: "CABA" },
  { name: "San Telmo", locality: "CABA" },
  { name: "Vélez Sársfield", locality: "CABA" },
  { name: "Versalles", locality: "CABA" },
  { name: "Villa Crespo", locality: "CABA" },
  { name: "Villa del Parque", locality: "CABA" },
  { name: "Villa Devoto", locality: "CABA" },
  { name: "Villa General Mitre", locality: "CABA" },
  { name: "Villa Lugano", locality: "CABA" },
  { name: "Villa Luro", locality: "CABA" },
  { name: "Villa Ortúzar", locality: "CABA" },
  { name: "Villa Pueyrredón", locality: "CABA" },
  { name: "Villa Real", locality: "CABA" },
  { name: "Villa Riachuelo", locality: "CABA" },
  { name: "Villa Santa Rita", locality: "CABA" },
  { name: "Villa Soldati", locality: "CABA" },
  { name: "Villa Urquiza", locality: "CABA" },
  { name: "Avellaneda", locality: "GBA" },
  { name: "Banfield", locality: "GBA" },
  { name: "Bernal", locality: "GBA" },
  { name: "Caseros", locality: "GBA" },
  { name: "Don Torcuato", locality: "GBA" },
  { name: "Florencio Varela", locality: "GBA" },
  { name: "General San Martín", locality: "GBA" },
  { name: "Haedo", locality: "GBA" },
  { name: "Hurlingham", locality: "GBA" },
  { name: "Ituzaingó", locality: "GBA" },
  { name: "José C. Paz", locality: "GBA" },
  { name: "La Matanza", locality: "GBA" },
  { name: "Lanús", locality: "GBA" },
  { name: "Lomas de Zamora", locality: "GBA" },
  { name: "Malvinas Argentinas", locality: "GBA" },
  { name: "Merlo", locality: "GBA" },
  { name: "Moreno", locality: "GBA" },
  { name: "Morón", locality: "GBA" },
  { name: "Olivos", locality: "GBA" },
  { name: "Quilmes", locality: "GBA" },
  { name: "Ramos Mejía", locality: "GBA" },
  { name: "San Fernando", locality: "GBA" },
  { name: "San Isidro", locality: "GBA" },
  { name: "San Justo", locality: "GBA" },
  { name: "San Miguel", locality: "GBA" },
  { name: "Tigre", locality: "GBA" },
  { name: "Tres de Febrero", locality: "GBA" },
  { name: "Vicente López", locality: "GBA" },
];
