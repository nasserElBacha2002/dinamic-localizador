# SQL boundaries

Scanner: 103 findings (57 medium, 46 info).

- Controllers generally free of executable SQL (architecture rule).
- Dynamic `${whereClause}` from fixed fragments + `.input()` — sampled safe; still a maintenance hazard.
- Business logic in SQL for statistics projections — accepted performance tradeoff; document as dual write/read model for punctuality.
