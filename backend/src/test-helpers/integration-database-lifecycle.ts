import { readFileSync, writeFileSync, unlinkSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  activateEphemeralIntegrationDatabase,
  bootstrapEphemeralIntegrationDatabase,
  createEphemeralIntegrationDatabase,
  destroyEphemeralIntegrationDatabase,
  type EphemeralIntegrationDatabaseHandle,
} from "./ephemeral-integration-database";
import {
  resolveTestSqlProvisionCredentials,
  resolveTestSqlRuntimeCredentials,
} from "./test-sql-credentials";
import { connectDatabase, closeDatabase, getPool } from "../database/connection";
import { assertIntegrationDatabaseNameIsEphemeral } from "./test-sql-server-guard";
import { seedIntegrationFixturesOnPool } from "./integration-database-seed";

export type IntegrationDatabaseSessionState = {
  handle: EphemeralIntegrationDatabaseHandle;
  stateFilePath: string;
};

const resolveOrchestratorPid = (): number => {
  const fromEnv = Number(process.env.DINAMIC_INTEGRATION_ORCHESTRATOR_PID);
  return Number.isInteger(fromEnv) && fromEnv > 0 ? fromEnv : process.pid;
};

const stateFilePathForPid = (pid: number): string =>
  join(tmpdir(), `dinamic-integration-db-${pid}.json`);

export type IntegrationDatabaseSessionFile = {
  pid: number;
  orchestratorPid: number;
  databaseName: string;
  runId: string;
  ownershipToken: string;
  allowedServerName: string;
  createdAtIso: string;
  serverNames: string[];
};

export const writeIntegrationDatabaseSessionFile = (
  handle: EphemeralIntegrationDatabaseHandle,
): string => {
  const stateFilePath = stateFilePathForPid(resolveOrchestratorPid());
  const payload: IntegrationDatabaseSessionFile = {
    pid: process.pid,
    orchestratorPid: handle.evidence.orchestratorPid,
    databaseName: handle.evidence.databaseName,
    runId: handle.evidence.runId,
    ownershipToken: handle.evidence.ownershipToken,
    allowedServerName: handle.evidence.allowedServerName,
    createdAtIso: handle.evidence.createdAtIso,
    serverNames: handle.evidence.serverNames,
  };
  writeFileSync(stateFilePath, JSON.stringify(payload, null, 2), "utf8");
  return stateFilePath;
};

export const readIntegrationDatabaseSessionFile = (
  pid: number = resolveOrchestratorPid(),
): IntegrationDatabaseSessionFile | null => {
  const stateFilePath = stateFilePathForPid(pid);
  if (!existsSync(stateFilePath)) {
    return null;
  }
  return JSON.parse(readFileSync(stateFilePath, "utf8")) as IntegrationDatabaseSessionFile;
};

export const removeIntegrationDatabaseSessionFile = (
  pid: number = resolveOrchestratorPid(),
): void => {
  const stateFilePath = stateFilePathForPid(pid);
  if (existsSync(stateFilePath)) {
    unlinkSync(stateFilePath);
  }
};

export const provisionIntegrationTestDatabase = async (): Promise<IntegrationDatabaseSessionState> => {
  const provisionCredentials = resolveTestSqlProvisionCredentials();
  const orchestratorPid = resolveOrchestratorPid();
  const handle = await createEphemeralIntegrationDatabase(provisionCredentials, { orchestratorPid });
  try {
    await bootstrapEphemeralIntegrationDatabase(handle);
    await activateEphemeralIntegrationDatabase(handle);
    await connectDatabase();
    await seedIntegrationFixturesOnPool(getPool());
    await closeDatabase();
  } catch (error) {
    await destroyEphemeralIntegrationDatabase(handle).catch(() => {
      // best effort
    });
    throw error;
  }

  const stateFilePath = writeIntegrationDatabaseSessionFile(handle);
  return { handle, stateFilePath };
};

export const teardownIntegrationTestDatabase = async (
  session: IntegrationDatabaseSessionState,
): Promise<void> => {
  assertIntegrationDatabaseNameIsEphemeral(session.handle.evidence.databaseName);
  await destroyEphemeralIntegrationDatabase(session.handle);
  removeIntegrationDatabaseSessionFile();
};

export const teardownIntegrationTestDatabaseFromSessionFile = async (
  pid: number = resolveOrchestratorPid(),
): Promise<void> => {
  const file = readIntegrationDatabaseSessionFile(pid);
  if (!file) {
    if (process.env.DINAMIC_TEST_SQL_ACTIVE === "true") {
      throw new Error(
        `No integration session file for orchestrator pid ${pid} (refusing silent teardown).`,
      );
    }
    return;
  }
  if (file.orchestratorPid !== pid) {
    throw new Error(
      `Integration session orchestrator mismatch: file=${file.orchestratorPid} env=${pid}.`,
    );
  }
  const provisionCredentials = resolveTestSqlProvisionCredentials();
  const { destroyEphemeralIntegrationDatabaseByName } = await import("./ephemeral-integration-database");
  await destroyEphemeralIntegrationDatabaseByName(provisionCredentials, file.databaseName, {
    ownershipToken: file.ownershipToken,
    orchestratorPid: file.orchestratorPid,
  });
  removeIntegrationDatabaseSessionFile(pid);
};