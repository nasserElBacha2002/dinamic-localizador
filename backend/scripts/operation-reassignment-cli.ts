import { env } from "../src/config/env";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface OperationReassignmentCliArgs {
  companyId: string;
  operationId: string;
  workDate?: string;
  apply: boolean;
}

export const parseOperationReassignmentCliArgs = (
  argv: string[],
): OperationReassignmentCliArgs => {
  const args = new Map<string, string | boolean>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      args.set("apply", true);
      continue;
    }
    if (token === "--preview") {
      args.set("apply", false);
      continue;
    }
    if (token.startsWith("--") && argv[index + 1]) {
      args.set(token.slice(2), argv[index + 1]!);
      index += 1;
    }
  }

  const companyId = String(args.get("company-id") ?? "");
  const operationId = String(args.get("operation-id") ?? "");
  const workDate = args.get("work-date") ? String(args.get("work-date")) : undefined;

  if (!UUID_PATTERN.test(companyId)) {
    throw new Error("company-id inválido (UUID requerido)");
  }
  if (!UUID_PATTERN.test(operationId)) {
    throw new Error("operation-id inválido (UUID requerido)");
  }
  if (workDate && !DATE_PATTERN.test(workDate)) {
    throw new Error("work-date inválida (formato YYYY-MM-DD)");
  }

  return {
    companyId,
    operationId,
    workDate,
    apply: args.get("apply") === true,
  };
};

export const printOperationalEnvironment = (): void => {
  console.log("Entorno:", env.NODE_ENV);
  console.log("Base de datos:", env.DB_NAME);
  console.log("Host:", `${env.DB_HOST}:${env.DB_PORT}`);
};

export const exitWithError = (error: unknown): never => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
};
