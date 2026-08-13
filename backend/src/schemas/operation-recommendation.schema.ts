import { z } from "zod";
import { WORKFORCE_RECOMMENDATION_V1_LIMITS } from "../constants/workforce-recommendation-v1";

export const listEmployeeRecommendationsQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(WORKFORCE_RECOMMENDATION_V1_LIMITS.maxLimit)
    .default(WORKFORCE_RECOMMENDATION_V1_LIMITS.defaultLimit),
});

export type ListEmployeeRecommendationsQuery = z.infer<
  typeof listEmployeeRecommendationsQuerySchema
>;
