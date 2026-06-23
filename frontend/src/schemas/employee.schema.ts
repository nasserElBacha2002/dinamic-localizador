import { z } from "zod";
import { EMPLOYEE_TYPES } from "../constants/employee-types";

const phoneRegex = /^\+[1-9]\d{7,14}$/;

export const employeeFormSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio"),
  documentNumber: z.string().trim().optional().or(z.literal("")),
  phoneNumber: z
    .string()
    .trim()
    .min(1, "El teléfono es obligatorio")
    .regex(phoneRegex, "Usá formato internacional, por ejemplo +5491112345678"),
  employeeType: z
    .string()
    .min(1, "Seleccioná un tipo de empleado")
    .pipe(z.enum(EMPLOYEE_TYPES)),
  active: z.boolean(),
});

export type EmployeeFormInputValues = z.input<typeof employeeFormSchema>;
export type EmployeeFormValues = z.infer<typeof employeeFormSchema>;
