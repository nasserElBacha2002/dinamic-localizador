import type { Request, Response } from "express";
import type { ListEmployeeCategoriesQuery } from "../schemas/employee-category.schema";
import { employeeCategoryService } from "../services/employee-category.service";
import { requireRequestCompanyId } from "../utils/request-company";

export const employeeCategoryController = {
  async list(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const categories = await employeeCategoryService.list(
      companyId,
      (req.validatedQuery ?? { includeInactive: false }) as ListEmployeeCategoriesQuery,
    );
    res.status(200).json({ data: categories });
  },

  async create(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const category = await employeeCategoryService.create(companyId, req.companyRole!, req.body);
    res.status(201).json({ data: category });
  },

  async update(req: Request, res: Response) {
    const companyId = requireRequestCompanyId(req);
    const category = await employeeCategoryService.update(
      companyId,
      req.companyRole!,
      String(req.params.categoryId),
      req.body,
    );
    res.status(200).json({ data: category });
  },
};
