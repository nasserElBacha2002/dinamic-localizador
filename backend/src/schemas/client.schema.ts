import { z } from "zod";

const clientNameSchema = z
  .string()
  .trim()
  .min(1, "El nombre del cliente es obligatorio")
  .max(255, "El nombre del cliente no puede superar los 255 caracteres");

export const createClientSchema = z.object({
  name: clientNameSchema,
});

export const updateClientSchema = z
  .object({
    name: clientNameSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Debe enviar al menos un campo para actualizar",
  });

export const clientIdParamSchema = z.object({
  clientId: z.string().uuid("El identificador del cliente no es válido"),
});

export const listClientsQuerySchema = z.object({
  active: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => {
      if (value === undefined) {
        return undefined;
      }

      return value === "true";
    }),

  search: z
    .string()
    .trim()
    .min(1)
    .max(255)
    .optional(),

  sortBy: z
    .enum(["name", "updatedAt"])
    .default("updatedAt"),

  sortDirection: z
    .enum(["asc", "desc"])
    .default("desc"),

  page: z.coerce
    .number()
    .int()
    .min(1)
    .default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),
});

export type CreateClientInput = z.infer<
  typeof createClientSchema
>;

export type UpdateClientInput = z.infer<
  typeof updateClientSchema
>;

export type ClientIdParams = z.infer<
  typeof clientIdParamSchema
>;

export type ListClientsQuery = z.infer<
  typeof listClientsQuerySchema
>;