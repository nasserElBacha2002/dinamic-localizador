import { z } from "zod";

const phoneRegex = /^\+[1-9]\d{7,14}$/;

export const employeeFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  documentNumber: z.string().trim().optional().or(z.literal("")),
  phoneNumber: z
    .string()
    .trim()
    .min(1, "El teléfono es obligatorio")
    .regex(phoneRegex, "Usá formato internacional, por ejemplo +5491112345678"),
  active: z.boolean(),
});

export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;
