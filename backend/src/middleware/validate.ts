import type { NextFunction, Request, Response } from "express";
import { ZodError, type ZodType } from "zod";
import { AppError } from "../errors/app-error";

type RequestPart = "body" | "query" | "params";

export const validate =
  <T>(schema: ZodType<T>, part: RequestPart = "body") =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse(req[part]);

      if (part === "query") {
        req.validatedQuery = parsed;
      } else {
        req[part] = parsed;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const message = error.issues.map((issue) => issue.message).join("; ");
        next(new AppError(400, "VALIDATION_ERROR", message));
        return;
      }

      next(error);
    }
  };
