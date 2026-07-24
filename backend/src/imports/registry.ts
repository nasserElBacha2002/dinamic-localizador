import { AppError } from "../errors/app-error";
import type { ImportEntityType } from "./constants";
import { isImportEntityType } from "./constants";
import { employeesImportStrategy } from "./strategies/employees.strategy";
import { operationsImportStrategy } from "./strategies/operations.strategy";
import { servicesImportStrategy } from "./strategies/services.strategy";
import type { ImportStrategy } from "./strategy";

const strategies: ImportStrategy[] = [
  operationsImportStrategy,
  servicesImportStrategy,
  employeesImportStrategy,
];

const byType = new Map<ImportEntityType, ImportStrategy>(
  strategies.map((strategy) => [strategy.entityType, strategy]),
);

export const importStrategyRegistry = {
  list(): ImportStrategy[] {
    return [...strategies];
  },

  get(entityType: string): ImportStrategy {
    if (!isImportEntityType(entityType)) {
      throw new AppError(
        400,
        "IMPORT_ENTITY_TYPE_INVALID",
        "Tipo de importación no soportado.",
      );
    }

    const strategy = byType.get(entityType);
    if (!strategy) {
      throw new AppError(
        400,
        "IMPORT_ENTITY_TYPE_INVALID",
        "Tipo de importación no soportado.",
      );
    }

    return strategy;
  },
};
