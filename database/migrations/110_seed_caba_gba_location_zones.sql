-- Idempotent seed of common CABA / GBA geographic zones into the global catalog.
-- Uses dbo.fn_normalize_location_zone_text (same identity as Node normalizeLocationZoneName).
-- Does NOT auto-associate companies.
-- Requires migration 109 (fn + global catalog).
-- Staging uses a permanent table: node-mssql applies each GO as a separate Request,
-- so session #temp tables are not reliably visible across batches.

USE dinamic_attendance;
GO

IF OBJECT_ID(N'dbo.fn_normalize_location_zone_text', N'FN') IS NULL
BEGIN
    THROW 50092, N'MIGRATION_110 requires dbo.fn_normalize_location_zone_text from migration 109.', 1;
END;
GO

IF OBJECT_ID(N'dbo.__mig110_seed_zones', N'U') IS NOT NULL DROP TABLE dbo.__mig110_seed_zones;
GO

CREATE TABLE dbo.__mig110_seed_zones (
    name NVARCHAR(120) NOT NULL,
    locality NVARCHAR(120) NOT NULL
);
GO

INSERT INTO dbo.__mig110_seed_zones (name, locality) VALUES
(N'Agronomía', N'CABA'),
(N'Almagro', N'CABA'),
(N'Balvanera', N'CABA'),
(N'Barracas', N'CABA'),
(N'Belgrano', N'CABA'),
(N'Boedo', N'CABA'),
(N'Caballito', N'CABA'),
(N'Chacarita', N'CABA'),
(N'Coghlan', N'CABA'),
(N'Colegiales', N'CABA'),
(N'Constitución', N'CABA'),
(N'Flores', N'CABA'),
(N'Floresta', N'CABA'),
(N'La Boca', N'CABA'),
(N'Liniers', N'CABA'),
(N'Mataderos', N'CABA'),
(N'Monserrat', N'CABA'),
(N'Monte Castro', N'CABA'),
(N'Nueva Pompeya', N'CABA'),
(N'Núñez', N'CABA'),
(N'Palermo', N'CABA'),
(N'Parque Avellaneda', N'CABA'),
(N'Parque Chacabuco', N'CABA'),
(N'Parque Chas', N'CABA'),
(N'Parque Patricios', N'CABA'),
(N'Paternal', N'CABA'),
(N'Puerto Madero', N'CABA'),
(N'Recoleta', N'CABA'),
(N'Retiro', N'CABA'),
(N'Saavedra', N'CABA'),
(N'San Cristóbal', N'CABA'),
(N'San Nicolás', N'CABA'),
(N'San Telmo', N'CABA'),
(N'Vélez Sársfield', N'CABA'),
(N'Versalles', N'CABA'),
(N'Villa Crespo', N'CABA'),
(N'Villa del Parque', N'CABA'),
(N'Villa Devoto', N'CABA'),
(N'Villa General Mitre', N'CABA'),
(N'Villa Lugano', N'CABA'),
(N'Villa Luro', N'CABA'),
(N'Villa Ortúzar', N'CABA'),
(N'Villa Pueyrredón', N'CABA'),
(N'Villa Real', N'CABA'),
(N'Villa Riachuelo', N'CABA'),
(N'Villa Santa Rita', N'CABA'),
(N'Villa Soldati', N'CABA'),
(N'Villa Urquiza', N'CABA'),
(N'Avellaneda', N'GBA'),
(N'Banfield', N'GBA'),
(N'Bernal', N'GBA'),
(N'Caseros', N'GBA'),
(N'Don Torcuato', N'GBA'),
(N'Florencio Varela', N'GBA'),
(N'General San Martín', N'GBA'),
(N'Haedo', N'GBA'),
(N'Hurlingham', N'GBA'),
(N'Ituzaingó', N'GBA'),
(N'José C. Paz', N'GBA'),
(N'La Matanza', N'GBA'),
(N'Lanús', N'GBA'),
(N'Lomas de Zamora', N'GBA'),
(N'Malvinas Argentinas', N'GBA'),
(N'Merlo', N'GBA'),
(N'Moreno', N'GBA'),
(N'Morón', N'GBA'),
(N'Olivos', N'GBA'),
(N'Quilmes', N'GBA'),
(N'Ramos Mejía', N'GBA'),
(N'San Fernando', N'GBA'),
(N'San Isidro', N'GBA'),
(N'San Justo', N'GBA'),
(N'San Miguel', N'GBA'),
(N'Tigre', N'GBA'),
(N'Tres de Febrero', N'GBA'),
(N'Vicente López', N'GBA');
GO

INSERT INTO dbo.location_zones (
    name,
    normalized_name,
    locality,
    normalized_locality,
    geocoding_status,
    is_active
)
SELECT
    s.name,
    dbo.fn_normalize_location_zone_text(s.name),
    s.locality,
    dbo.fn_normalize_location_zone_text(s.locality),
    N'PENDING',
    1
FROM dbo.__mig110_seed_zones s
WHERE NOT EXISTS (
    SELECT 1
    FROM dbo.location_zones lz
    WHERE lz.normalized_name = dbo.fn_normalize_location_zone_text(s.name)
      AND lz.normalized_locality = dbo.fn_normalize_location_zone_text(s.locality)
);
GO

IF OBJECT_ID(N'dbo.__mig110_seed_zones', N'U') IS NOT NULL DROP TABLE dbo.__mig110_seed_zones;
GO
