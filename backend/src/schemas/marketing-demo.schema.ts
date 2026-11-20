import { z } from "zod";

export const MARKETING_DEMO_EMPLOYEE_RANGES = ["1-25", "26-100", "101-500", "501+"] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => (value === "" ? undefined : value));

export const marketingDemoRequestSchema = z
  .object({
    fullName: z.string().trim().min(2, "Ingresá nombre y apellido").max(120),
    company: z.string().trim().min(2, "Ingresá el nombre de la empresa").max(160),
    email: z.string().trim().email("Ingresá un email laboral válido").max(255),
    employeeRange: z.enum(MARKETING_DEMO_EMPLOYEE_RANGES, {
      message: "Seleccioná un rango de empleados",
    }),
    phone: optionalText(40),
    serviceLocations: optionalText(500),
    /** Honeypot — must stay empty for legitimate clients. */
    companyWebsite: z
      .string()
      .max(200)
      .optional()
      .transform((value) => value ?? ""),
  })
  .strict();

export type MarketingDemoRequestInput = z.infer<typeof marketingDemoRequestSchema>;