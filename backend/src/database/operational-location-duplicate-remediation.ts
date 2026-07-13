export const buildOperationalLocationDuplicateAuditQuery = (companyId?: string): string => {
  const companyFilter = companyId ? "AND ol.company_id = @companyId" : "";

  return `
    SELECT
      ol.company_id,
      c.name AS company_name,
      LTRIM(RTRIM(ol.name)) AS normalized_name,
      ol.id,
      ol.name AS current_name,
      ol.active,
      ol.created_at,
      (
        SELECT COUNT(*)
        FROM dbo.scheduled_operations so
        WHERE so.service_id = ol.id
          AND so.company_id = ol.company_id
      ) AS operation_count,
      ROW_NUMBER() OVER (
        PARTITION BY ol.company_id, LTRIM(RTRIM(ol.name))
        ORDER BY
          (
            SELECT COUNT(*)
            FROM dbo.scheduled_operations so
            WHERE so.service_id = ol.id
              AND so.company_id = ol.company_id
          ) DESC,
          ol.active DESC,
          ol.created_at ASC,
          ol.id ASC
      ) AS duplicate_rank
    FROM dbo.operational_locations ol
    INNER JOIN dbo.companies c ON c.id = ol.company_id
    WHERE EXISTS (
      SELECT 1
      FROM dbo.operational_locations dup
      WHERE dup.company_id = ol.company_id
        AND LTRIM(RTRIM(dup.name)) = LTRIM(RTRIM(ol.name))
      GROUP BY dup.company_id, LTRIM(RTRIM(dup.name))
      HAVING COUNT(*) > 1
    )
    ${companyFilter}
    ORDER BY c.name, normalized_name, duplicate_rank;
  `;
};

export const buildOperationalLocationDuplicateRemediationUpdate = (companyId?: string): string => {
  const companyFilter = companyId ? "WHERE company_id = @companyId" : "";

  return `
    ;WITH duplicate_groups AS (
        SELECT
            company_id,
            LTRIM(RTRIM(name)) AS normalized_name
        FROM dbo.operational_locations
        ${companyFilter}
        GROUP BY company_id, LTRIM(RTRIM(name))
        HAVING COUNT(*) > 1
    ),
    ranked AS (
        SELECT
            ol.id,
            ol.company_id,
            LTRIM(RTRIM(ol.name)) AS normalized_name,
            ROW_NUMBER() OVER (
                PARTITION BY ol.company_id, LTRIM(RTRIM(ol.name))
                ORDER BY
                    (
                        SELECT COUNT(*)
                        FROM dbo.scheduled_operations so
                        WHERE so.service_id = ol.id
                          AND so.company_id = ol.company_id
                    ) DESC,
                    ol.active DESC,
                    ol.created_at ASC,
                    ol.id ASC
            ) AS duplicate_rank
        FROM dbo.operational_locations ol
        INNER JOIN duplicate_groups dg
            ON dg.company_id = ol.company_id
           AND dg.normalized_name = LTRIM(RTRIM(ol.name))
    ),
    rename_candidates AS (
        SELECT
            ranked.id,
            ranked.company_id,
            ranked.normalized_name + N' (' + CAST(ranked.duplicate_rank AS NVARCHAR(10)) + N')' AS candidate_name
        FROM ranked
        WHERE ranked.duplicate_rank > 1
    ),
    final_names AS (
        SELECT
            rename_candidates.id,
            rename_candidates.company_id,
            rename_candidates.candidate_name,
            ROW_NUMBER() OVER (
                PARTITION BY rename_candidates.company_id, rename_candidates.candidate_name
                ORDER BY rename_candidates.id
            ) AS name_collision_rank
        FROM rename_candidates
    )
    UPDATE ol
    SET
        name = CASE
            WHEN final_names.name_collision_rank > 1
                THEN final_names.candidate_name
                    + N' #'
                    + LEFT(REPLACE(CAST(final_names.id AS NVARCHAR(36)), N'-', N''), 8)
            ELSE final_names.candidate_name
        END,
        updated_at = SYSUTCDATETIME()
    OUTPUT
        inserted.id,
        deleted.name AS previous_name,
        inserted.name AS new_name,
        inserted.company_id;
  `;
};

export const buildProposedOperationalLocationName = (input: {
  normalizedName: string;
  duplicateRank: number;
  id: string;
  nameCollisionRank?: number;
}): string => {
  if (input.duplicateRank <= 1) {
    return input.normalizedName;
  }

  const base = `${input.normalizedName} (${input.duplicateRank})`;
  if ((input.nameCollisionRank ?? 1) <= 1) {
    return base;
  }

  const idSuffix = input.id.replace(/-/g, "").slice(0, 8);
  return `${base} #${idSuffix}`;
};
