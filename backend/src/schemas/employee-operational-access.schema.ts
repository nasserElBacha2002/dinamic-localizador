import { z } from "zod";

export const linkOperationalAccessSchema = z.object({
  userId: z.string().uuid(),
});

export const inviteOperationalAccessSchema = z.object({
  email: z.string().email(),
  inviteeName: z.string().trim().min(1).max(150).optional().nullable(),
});
