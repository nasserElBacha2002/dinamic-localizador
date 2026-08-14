import { z } from "zod";
import { WORKFORCE_RECOMMENDATION_V1_LIMITS } from "../constants/workforce-recommendation-v1";
import { WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS } from "../constants/workforce-team-recommendation-v1";

const isoDateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveDate debe tener formato YYYY-MM-DD")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    const dt = new Date(Date.UTC(y!, m! - 1, d!));
    return (
      dt.getUTCFullYear() === y &&
      dt.getUTCMonth() === m! - 1 &&
      dt.getUTCDate() === d
    );
  }, "effectiveDate no es una fecha válida");

export const listEmployeeRecommendationsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(WORKFORCE_RECOMMENDATION_V1_LIMITS.maxLimit)
    .default(WORKFORCE_RECOMMENDATION_V1_LIMITS.defaultLimit),
  /** RECURRING only: work-date context for active assignments. Ignored for ONE_TIME. */
  effectiveDate: isoDateOnly.optional(),
});

export type ListEmployeeRecommendationsQuery = z.infer<
  typeof listEmployeeRecommendationsQuerySchema
>;

const lockedEmployeeIdsSchema = z
  .array(z.string().uuid("UUID de colaborador inválido"))
  .max(WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.maxTeamSize)
  .default([]);

/** Read-only POST body for operation team composition. */
export const recommendOperationTeamSchema = z.object({
  teamSize: z.coerce
    .number()
    .int()
    .min(WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.minTeamSize)
    .max(WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.maxTeamSize),
  alternatives: z.coerce
    .number()
    .int()
    .min(1)
    .max(WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.maxAlternatives)
    .default(WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.defaultAlternatives),
  lockedEmployeeIds: lockedEmployeeIdsSchema,
  effectiveDate: isoDateOnly.optional(),
});

export type RecommendOperationTeamInput = z.infer<typeof recommendOperationTeamSchema>;

/** Read-only POST body for reusable work-team composition. */
export const recommendWorkTeamSchema = z.object({
  teamSize: z.coerce
    .number()
    .int()
    .min(WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.minTeamSize)
    .max(WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.maxTeamSize),
  alternatives: z.coerce
    .number()
    .int()
    .min(1)
    .max(WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.maxAlternatives)
    .default(WORKFORCE_TEAM_RECOMMENDATION_V1_LIMITS.defaultAlternatives),
  lockedEmployeeIds: lockedEmployeeIdsSchema,
  serviceId: z.string().uuid("UUID de servicio inválido").nullable().optional(),
});

export type RecommendWorkTeamInput = z.infer<typeof recommendWorkTeamSchema>;
