import type { Request, Response } from "express";
import { employeeService } from "../services/employee.service";

export const employeeController = {
  async create(req: Request, res: Response) {
    const employee = await employeeService.create(req.body);
    res.status(201).json({ data: employee });
  },

  async list(req: Request, res: Response) {
    const result = await employeeService.list(req.validatedQuery as never);
    res.status(200).json(result);
  },

  async getById(req: Request, res: Response) {
    const employee = await employeeService.getById(String(req.params.id));
    res.status(200).json({ data: employee });
  },

  async update(req: Request, res: Response) {
    const employee = await employeeService.update(String(req.params.id), req.body);
    res.status(200).json({ data: employee });
  },

  async deactivate(req: Request, res: Response) {
    const employee = await employeeService.deactivate(String(req.params.id));
    res.status(200).json({ data: employee });
  },
};
