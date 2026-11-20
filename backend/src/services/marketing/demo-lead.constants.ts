import type { MARKETING_DEMO_EMPLOYEE_RANGES } from "../../schemas/marketing-demo.schema";

export const EMPLOYEE_COUNT_RANGE_LABELS: Record<
  (typeof MARKETING_DEMO_EMPLOYEE_RANGES)[number],
  string
> = {
  "1-25": "1 – 25",
  "26-100": "26 – 100",
  "101-500": "101 – 500",
  "501+": "Más de 500",
};